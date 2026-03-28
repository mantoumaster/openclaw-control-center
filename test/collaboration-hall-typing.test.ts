import assert from "node:assert/strict";
import test from "node:test";
import { ReadonlyToolClient } from "../src/clients/tool-client";
import {
  abortHallDraftReply,
  beginHallDraftReply,
  completeHallDraftReply,
  pushHallDraftDelta,
} from "../src/runtime/collaboration-stream";

test("hall SSE publishes multi-agent typing lifecycle events", async () => {
  const server = await startTestUiServer();
  try {
    if (!server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
      });
    }
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Failed to bind ephemeral UI port.");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${baseUrl}/api/hall/events?hallId=main`);
    assert.equal(response.status, 200);
    assert(response.body, "Expected SSE response body");

    const eventPromise = collectCollaborationEvents(response, (events) => {
      const completeCount = events.filter((event) => event.type === "draft_complete").length;
      return completeCount >= 2;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const coqDraftId = beginHallDraftReply({
      hallId: "main",
      authorParticipantId: "coq",
      authorLabel: "Coq-每日新闻",
      authorSemanticRole: "planner",
      messageKind: "proposal",
      content: "Typing lifecycle test one.",
    });
    const pandasDraftId = beginHallDraftReply({
      hallId: "main",
      authorParticipantId: "pandas",
      authorLabel: "pandas",
      authorSemanticRole: "coder",
      messageKind: "proposal",
      content: "Typing lifecycle test two.",
    });

    pushHallDraftDelta({
      hallId: "main",
      draftId: coqDraftId,
      authorParticipantId: "coq",
      authorLabel: "Coq-每日新闻",
      authorSemanticRole: "planner",
      messageKind: "proposal",
      delta: "Planner is typing.",
    });
    pushHallDraftDelta({
      hallId: "main",
      draftId: pandasDraftId,
      authorParticipantId: "pandas",
      authorLabel: "pandas",
      authorSemanticRole: "coder",
      messageKind: "proposal",
      delta: "Coder is typing.",
    });

    completeHallDraftReply({
      hallId: "main",
      draftId: coqDraftId,
      content: "Typing lifecycle test one.",
    });
    completeHallDraftReply({
      hallId: "main",
      draftId: pandasDraftId,
      content: "Typing lifecycle test two.",
    });

    const events = await withTimeout(eventPromise, 5_000);
    const collaborationEvents = events.filter((event) => event.scope === "hall");
    const startEvents = collaborationEvents.filter((event) => event.type === "draft_start");
    const deltaEvents = collaborationEvents.filter((event) => event.type === "draft_delta");
    const completeEvents = collaborationEvents.filter((event) => event.type === "draft_complete");

    assert.equal(startEvents.length, 2);
    assert.equal(deltaEvents.length, 2);
    assert.equal(completeEvents.length, 2);
    assert.deepEqual(
      startEvents.map((event) => event.authorLabel),
      ["Coq-每日新闻", "pandas"],
    );
    assert.deepEqual(
      completeEvents.map((event) => event.draftId).sort(),
      [coqDraftId, pandasDraftId].sort(),
    );
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  }
});

test("hall discussion primes multiple typing participants before the first reply completes", async () => {
  const server = await startTestUiServer();
  try {
    if (!server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
      });
    }
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Failed to bind ephemeral UI port.");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${baseUrl}/api/hall/events?hallId=main`);
    assert.equal(response.status, 200);
    assert(response.body, "Expected SSE response body");

    const content = `我要策划一个互动数据叙事体验-${Date.now()}，先讨论目标受众、叙事结构、风险和执行顺序。`;
    const createResponse = await fetch(`${baseUrl}/api/hall/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const createPayload = await createResponse.json();
    assert.equal(createResponse.status, 201);
    assert.equal(createPayload.ok, true);
    const taskCardId = createPayload.taskCard?.taskCardId;
    assert.equal(typeof taskCardId, "string");

    const events = await withTimeout(
      collectCollaborationEvents(response, (streamEvents) => {
        const taskEvents = streamEvents.filter((event) => event.taskCardId === taskCardId);
        return taskEvents.some((event) => event.type === "draft_complete");
      }),
      15_000,
    );

    const taskEvents = events.filter((event) => event.taskCardId === taskCardId);
    const firstCompleteIndex = taskEvents.findIndex((event) => event.type === "draft_complete");
    assert.notEqual(firstCompleteIndex, -1);
    const startsBeforeFirstComplete = taskEvents
      .slice(0, firstCompleteIndex)
      .filter((event) => event.type === "draft_start");
    const startAuthors = [...new Set(startsBeforeFirstComplete.map((event) => String(event.authorParticipantId || "")))];

    assert.ok(startAuthors.length >= 2, `Expected at least 2 typing participants before first complete, saw ${startAuthors.join(", ")}`);
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  }
});

test("hall SSE can abort placeholder typing drafts", async () => {
  const server = await startTestUiServer();
  try {
    if (!server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
      });
    }
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Failed to bind ephemeral UI port.");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${baseUrl}/api/hall/events?hallId=main`);
    assert.equal(response.status, 200);
    assert(response.body, "Expected SSE response body");

    let expectedDraftId: string | undefined;
    const eventPromise = collectCollaborationEvents(response, (events) => {
      return Boolean(
        expectedDraftId
        && events.some((event) => event.type === "draft_abort" && event.draftId === expectedDraftId),
      );
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const draftId = beginHallDraftReply({
      hallId: "main",
      authorParticipantId: "monkey",
      authorLabel: "monkey",
      authorSemanticRole: "reviewer",
      messageKind: "proposal",
      content: "",
    });
    expectedDraftId = draftId;
    abortHallDraftReply({
      hallId: "main",
      draftId,
      reason: "test_abort",
    });

    const events = await withTimeout(eventPromise, 5_000);
    const abortEvent = [...events].reverse().find((event) => event.type === "draft_abort" && event.draftId === draftId);
    assert.ok(abortEvent);
    assert.equal(abortEvent?.draftId, draftId);
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  }
});

async function collectCollaborationEvents(
  response: Response,
  shouldStop: (events: Array<Record<string, unknown>>) => boolean,
): Promise<Array<Record<string, unknown>>> {
  const reader = response.body?.getReader();
  if (!reader) return [];
  const decoder = new TextDecoder();
  let buffer = "";
  const events: Array<Record<string, unknown>> = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
      if (!block.trim() || block.startsWith(":")) continue;
      let eventName = "";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) eventName = line.slice("event:".length).trim();
        if (line.startsWith("data:")) data += line.slice("data:".length).trim();
      }
      if (eventName === "collaboration" && data) {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        events.push(parsed);
        if (shouldStop(events)) {
          await reader.cancel();
          return events;
        }
      }
    }
  }

  return events;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function startTestUiServer() {
  const { startUiServer } = await import("../src/ui/server");
  return startUiServer(0, new ReadonlyToolClient(), {
    localTokenAuthRequired: false,
  });
}
