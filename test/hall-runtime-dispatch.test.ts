import assert from "node:assert/strict";
import test from "node:test";
import { compactHallCoworkerReply, compactHallDiscussionReply, dispatchHallRuntimeTurn, enforceConcreteDeliverableReply, summarizeWorkspacePersonaFromFiles } from "../src/runtime/hall-runtime-dispatch";

test("workspace persona summary reuses existing agent files instead of hall-only config", () => {
  const monkeyPersona = summarizeWorkspacePersonaFromFiles("/Users/tianyi/.openclaw/workspace/agents/monkey");
  const pandasPersona = summarizeWorkspacePersonaFromFiles("/Users/tianyi/.openclaw/workspace/agents/pandas");
  const coqPersona = summarizeWorkspacePersonaFromFiles("/Users/tianyi/.openclaw/workspace/agents/coq");

  assert.match(monkeyPersona, /(YouTube|视频转长文|价值提炼器)/);
  assert.match(pandasPersona, /(编码与实现|工程实现|验证驱动)/);
  assert.match(coqPersona, /(每日新闻|趋势简报|早晚报主编)/);
});

test("coworker reply compaction strips memo tone and keeps the handoff", () => {
  const result = compactHallCoworkerReply(
    "当前结果是：这版已经够用了。<br>我建议下一步把最后一拍再磨一下。<br>@otter 你只抓必须修改的一点。",
    "zh",
  );

  assert.equal(result.includes("当前结果是"), false);
  assert.equal(result.includes("我建议下一步"), false);
  assert.match(result, /@otter/);
});

test("discussion compaction keeps the selected sentences intact instead of truncating them with ellipses", () => {
  const result = compactHallDiscussionReply(
    "这 3 个入口已经够讲清主线了，我只补一个抓手：读代码时按“看见什么 → 谁决定怎么流转 → 谁把事真正发出去”这个顺序讲，读者最不容易乱。<br>也就是先看 src/ui/collaboration-hall.ts 里界面怎么把 hall-chat 呈现出来，再看 src/runtime/collaboration-hall-orchestrator.ts 里任务怎么轮转，最后看 src/runtime/hall-runtime-dispatch.ts 怎么把执行真正派出去。<br>@main 你最后只检查这 3 个文件是不是最关键。",
    "zh",
  );

  assert.equal(result.endsWith("…"), false);
  assert.match(result, /这 3 个入口已经够讲清主线了/);
  assert.match(result, /@main/);
});

test("execution reply that stays in meta-discussion cannot pretend to hand off", () => {
  const result = enforceConcreteDeliverableReply(
    {
      client: {} as never,
      hall: {
        hallId: "hall",
        participants: [],
        updatedAt: new Date().toISOString(),
      } as never,
      taskCard: {
        taskCardId: "card",
        hallId: "hall",
        projectId: "project",
        taskId: "task",
        title: "做一个视频介绍群聊功能",
        description: "做一个视频介绍群聊功能",
        stage: "execution",
        status: "in_progress",
        plannedExecutionOrder: [],
        plannedExecutionItems: [],
        currentExecutionItem: {
          itemId: "item",
          participantId: "monkey",
          task: "先出 3 个 thumbnail idea 给这一版视频样本",
          handoffWhen: "产物贴回群里就算完成。",
        },
        currentOwnerParticipantId: "monkey",
        currentOwnerLabel: "monkey",
        mentionedParticipantIds: [],
        sessionKeys: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as never,
      participant: {
        participantId: "monkey",
        displayName: "monkey",
        semanticRole: "coder",
        aliases: [],
        active: true,
      } as never,
      mode: "execution",
    },
    "这版样本更适合先证明节省协调成本，不然观众会先注意到画面很热闹。@pandas 你接着补最后一拍。",
    "handoff",
    "zh",
  );

  assert.equal(result.nextAction, "continue");
  assert.equal(result.suppressVisibleMessage, true);
  assert.equal(result.content, "");
  assert.match(result.nextStep ?? "", /下一条直接贴 3 个 thumbnail 方向/);
});

test("execution reply that stays in meta-discussion is hidden even before it tries to hand off", () => {
  const result = enforceConcreteDeliverableReply(
    {
      client: {} as never,
      hall: {
        hallId: "hall",
        participants: [],
        updatedAt: new Date().toISOString(),
      } as never,
      taskCard: {
        taskCardId: "card",
        hallId: "hall",
        projectId: "project",
        taskId: "task",
        title: "做一个视频介绍群聊功能",
        description: "做一个视频介绍群聊功能",
        stage: "execution",
        status: "in_progress",
        plannedExecutionOrder: [],
        plannedExecutionItems: [],
        currentExecutionItem: {
          itemId: "item",
          participantId: "pandas",
          task: "给出 3 个 hook",
          handoffWhen: "把 3 个 hook 贴回群里就算完成。",
        },
        currentOwnerParticipantId: "pandas",
        currentOwnerLabel: "pandas",
        mentionedParticipantIds: [],
        sessionKeys: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as never,
      participant: {
        participantId: "pandas",
        displayName: "pandas",
        semanticRole: "coder",
        aliases: [],
        active: true,
      } as never,
      mode: "execution",
    },
    "这版先把群聊价值讲清，别让观众先误会成普通聊天界面。",
    undefined,
    "zh",
  );

  assert.equal(result.nextAction, "continue");
  assert.equal(result.suppressVisibleMessage, true);
  assert.equal(result.content, "");
  assert.match(result.nextStep ?? "", /下一条直接贴 3 个 hook/);
});

test("generic carry-forward execution steps still require a concrete deliverable", () => {
  const result = enforceConcreteDeliverableReply(
    {
      client: {} as never,
      hall: {
        hallId: "hall",
        participants: [],
        updatedAt: new Date().toISOString(),
      } as never,
      taskCard: {
        taskCardId: "card",
        hallId: "hall",
        projectId: "project",
        taskId: "task",
        title: "继续推进这一轮",
        description: "继续推进这一轮",
        stage: "execution",
        status: "in_progress",
        plannedExecutionOrder: [],
        plannedExecutionItems: [],
        currentExecutionItem: {
          itemId: "item",
          participantId: "pandas",
          task: "承接上一步继续推进，重点延续上一轮结果。",
          handoffWhen: "把下一版具体结果贴回群里就算完成。",
        },
        currentOwnerParticipantId: "pandas",
        currentOwnerLabel: "pandas",
        mentionedParticipantIds: [],
        sessionKeys: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as never,
      participant: {
        participantId: "pandas",
        displayName: "pandas",
        semanticRole: "coder",
        aliases: [],
        active: true,
      } as never,
      mode: "execution",
    },
    "这版先把价值讲清，别让观众先误会成普通聊天界面。",
    undefined,
    "zh",
  );

  assert.equal(result.nextAction, "continue");
  assert.equal(result.suppressVisibleMessage, true);
  assert.equal(result.content, "");
  assert.match(result.nextStep ?? "", /下一条直接贴具体产物/);
});

test("repo scan execution reply that still speaks in abstractions is hidden until it cites concrete findings", () => {
  const result = enforceConcreteDeliverableReply(
    {
      client: {} as never,
      hall: {
        hallId: "hall",
        participants: [],
        updatedAt: new Date().toISOString(),
      } as never,
      taskCard: {
        taskCardId: "card",
        hallId: "hall",
        projectId: "project",
        taskId: "task",
        title: "扫描 control-center 代码库",
        description: "扫描 control-center 代码库",
        stage: "execution",
        status: "in_progress",
        plannedExecutionOrder: [],
        plannedExecutionItems: [],
        currentExecutionItem: {
          itemId: "item",
          participantId: "pandas",
          task: "Scan the repo and summarize the hall feature set.",
          handoffWhen: "把代码级总结贴回群里就算完成。",
        },
        currentOwnerParticipantId: "pandas",
        currentOwnerLabel: "pandas",
        mentionedParticipantIds: [],
        sessionKeys: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as never,
      participant: {
        participantId: "pandas",
        displayName: "pandas",
        semanticRole: "coder",
        aliases: [],
        active: true,
      } as never,
      mode: "execution",
    },
    "群聊功能已经收清了：它把讨论、分工、owner 收口、support-only 和 next action 串成一个可见的推进线程。",
    "handoff",
    "zh",
  );

  assert.equal(result.nextAction, "continue");
  assert.equal(result.suppressVisibleMessage, true);
  assert.equal(result.content, "");
  assert.match(result.nextStep ?? "", /真实文件路径/);
});

test("coworker compaction strips leaked structured fragments from visible text", () => {
  const result = compactHallCoworkerReply(
    '这版可以收口。<br>@otter 你按评审口径过一遍。<br>","nextAction":"handoff","nextStep":"otter 检查最后一个硬问题。<br><hall-structured>{"nextAction":"handoff"}</hall-structured>',
    "zh",
  );

  assert.match(result, /@otter/);
  assert.equal(result.includes('nextAction'), false);
  assert.equal(result.includes('hall-structured'), false);
});

test("coworker reply keeps concrete deliverable lists visible instead of collapsing them to two lines", () => {
  const result = compactHallCoworkerReply(
    "三个 hook 先给到：1, 不是多了个群聊, 是第一次让 AI 团队自己把任务往前推 2, 我做了个群聊, 重点不是聊天, 是它会自己收口 owner 和下一步 3, 以前要我盯全程, 现在这个群聊会自己把分工, 协作和推进串起来。",
    "zh",
  );

  assert.match(result, /1,/);
  assert.match(result, /2,/);
  assert.match(result, /3,/);
  assert.equal(result.endsWith("…"), false);
});

test("inline numbered deliverables separated by Chinese punctuation still count as concrete output", () => {
  const result = compactHallCoworkerReply(
    "第一版骨架先立住了：1. 任务抛进 hall；2. 两位 agent 快速补角度；3. owner 和下一步单独浮出来。",
    "zh",
  );

  assert.match(result, /1\./);
  assert.match(result, /2\./);
  assert.match(result, /3\./);
  assert.equal(result.endsWith("…"), false);
});

test("coworker reply treats three concrete hooks as a visible deliverable", () => {
  const result = compactHallCoworkerReply(
    "3 个 hook 先锁住了：“不是大家在聊天，是任务自己开始往前走”、“你不用再来回转述，群聊会自己收敛出 owner 和下一步”、“不是多一个群，是少掉中间协调的人力活”。@otter 你接着出 3 个 thumbnail 图的方向和 URL。",
    "zh",
  );

  assert.match(result, /3 个 hook/);
  assert.match(result, /@otter/);
  assert.equal(result.endsWith("…"), false);
});

test("coworker reply treats concrete repo findings as a visible deliverable", () => {
  const result = compactHallCoworkerReply(
    "我先扫了 4 个关键文件：src/ui/collaboration-hall.ts、src/ui/collaboration-hall-theme.ts、src/runtime/collaboration-hall-orchestrator.ts、src/runtime/hall-runtime-dispatch.ts。结论先锁 3 个：同线程推进、owner 明确、next action 可见。@monkey 你基于这 3 个点出 hook。",
    "zh",
  );

  assert.match(result, /src\/ui\/collaboration-hall\.ts/);
  assert.match(result, /src\/runtime\/hall-runtime-dispatch\.ts/);
  assert.match(result, /@monkey/);
  assert.equal(result.endsWith("…"), false);
});

test("coworker reply keeps legitimate support-only wording instead of deleting the whole deliverable line", () => {
  const result = compactHallCoworkerReply(
    "新群聊功能已经收清了：它把讨论、分工、owner 收口、support-only 和 next action 串成一个可见的任务推进线程，能把本来会来回拉扯的事及时收住。<br>@main 你接着按这句写 3 个 hook。",
    "zh",
  );

  assert.match(result, /support-only/);
  assert.match(result, /任务推进线程/);
  assert.match(result, /@main/);
});

test("explicit @main deliverable request overrides manager decision mode and returns concrete output", async () => {
  let capturedPrompt = "";
  const result = await dispatchHallRuntimeTurn({
    client: {
      agentRun: async (request: { message: string }) => {
        capturedPrompt = request.message;
        return {
          ok: true,
          text: '三个视频开头：1. 不是多了个群聊，是任务自己开始往前走。 2. 你不用再来回转述，群聊会自己收敛出 owner 和下一步。 3. 以前要你盯全程，现在它会自己把分工和推进串起来。',
          rawText: "",
        };
      },
    } as never,
    hall: {
      hallId: "hall",
      participants: [
        {
          participantId: "main",
          displayName: "main",
          semanticRole: "manager",
          aliases: [],
          active: true,
        },
      ],
      updatedAt: new Date().toISOString(),
    } as never,
    taskCard: {
      taskCardId: "card",
      hallId: "hall",
      projectId: "project",
      taskId: "task",
      title: "我想要做一个视频 介绍我的群聊功能",
      description: "我想要做一个视频 介绍我的群聊功能",
      stage: "discussion",
      status: "todo",
      plannedExecutionOrder: [],
      plannedExecutionItems: [],
      mentionedParticipantIds: [],
      sessionKeys: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never,
    participant: {
      participantId: "main",
      displayName: "main",
      semanticRole: "manager",
      aliases: [],
      active: true,
    } as never,
    triggerMessage: {
      hallId: "hall",
      messageId: "trigger",
      kind: "chat",
      authorParticipantId: "operator",
      authorLabel: "Operator",
      content: "@main 你给一下三个视频开头啊",
      targetParticipantIds: ["main"],
      mentionTargets: [{ participantId: "main" }],
      createdAt: new Date().toISOString(),
    } as never,
    mode: "discussion",
  });

  assert.match(capturedPrompt, /explicitly assigning you work right now/i);
  assert.match(capturedPrompt, /Prioritize this current ask over your default semantic role/i);
  assert.equal(result.kind, "status");
  assert.match(result.content, /三个视频开头/);
  assert.doesNotMatch(result.content, /先给 .* 开第一步|这一轮做到|Then hand off in this order/i);
});

test("direct deliverable replies in discussion stay fully visible instead of being compacted to two segments", async () => {
  const result = await dispatchHallRuntimeTurn({
    client: {
      agentRun: async () => ({
        ok: true,
        text: "对，既然网页已经有了，缺的就不是载体，而是能直接录的口播开头。<br>开头 1：你有没有遇到过这种情况，你把一件事丢进群里，大家聊了半天，最后还是没人动。<br>开头 2：以前你得自己盯着每个人接力，现在你把任务丢进群里，owner 和下一步会自己长出来。<br>开头 3：这不是 AI 在陪你聊天，而是它真的把中间协调吃掉了，所以事情会继续往前走。",
        rawText: "",
      }),
    } as never,
    hall: {
      hallId: "hall",
      participants: [
        {
          participantId: "otter",
          displayName: "otter",
          semanticRole: "reviewer",
          aliases: [],
          active: true,
        },
      ],
      updatedAt: new Date().toISOString(),
    } as never,
    taskCard: {
      taskCardId: "card",
      hallId: "hall",
      projectId: "project",
      taskId: "task",
      title: "我想要做一个视频 介绍我的群聊功能",
      description: "我想要做一个视频 介绍我的群聊功能",
      stage: "discussion",
      status: "todo",
      plannedExecutionOrder: [],
      plannedExecutionItems: [],
      mentionedParticipantIds: [],
      sessionKeys: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never,
    participant: {
      participantId: "otter",
      displayName: "otter",
      semanticRole: "reviewer",
      aliases: [],
      active: true,
    } as never,
    triggerMessage: {
      hallId: "hall",
      messageId: "trigger",
      kind: "chat",
      authorParticipantId: "operator",
      authorLabel: "Operator",
      content: "@otter 给我完整的三个视频开头，而不是给我三句话。",
      targetParticipantIds: ["otter"],
      mentionTargets: [{ participantId: "otter" }],
      createdAt: new Date().toISOString(),
    } as never,
    mode: "discussion",
  });

  assert.equal(result.suppressVisibleMessage, undefined);
  assert.match(result.content, /开头 1/);
  assert.match(result.content, /开头 2/);
  assert.match(result.content, /开头 3/);
  assert.doesNotMatch(result.content, /…$/);
});

test("direct video-opening request rejects evidence-point summaries until complete spoken openings are provided", async () => {
  const result = await dispatchHallRuntimeTurn({
    client: {
      agentRun: async () => ({
        ok: true,
        text: "这 3 个开头直接可录：一，src/ui/collaboration-hall.ts 证明这不是普通群聊壳子；二，src/runtime/collaboration-hall-orchestrator.ts 证明系统会接管中间协调；三，src/runtime/hall-runtime-dispatch.ts 证明收敛后的动作会继续派发执行。",
        rawText: "",
      }),
    } as never,
    hall: {
      hallId: "hall",
      participants: [
        {
          participantId: "main",
          displayName: "main",
          semanticRole: "manager",
          aliases: [],
          active: true,
        },
      ],
      updatedAt: new Date().toISOString(),
    } as never,
    taskCard: {
      taskCardId: "card",
      hallId: "hall",
      projectId: "project",
      taskId: "task",
      title: "我想要做一个视频 介绍我的群聊功能",
      description: "我想要做一个视频 介绍我的群聊功能",
      stage: "discussion",
      status: "todo",
      plannedExecutionOrder: [],
      plannedExecutionItems: [],
      mentionedParticipantIds: [],
      sessionKeys: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never,
    participant: {
      participantId: "main",
      displayName: "main",
      semanticRole: "manager",
      aliases: [],
      active: true,
    } as never,
    triggerMessage: {
      hallId: "hall",
      messageId: "trigger",
      kind: "chat",
      authorParticipantId: "operator",
      authorLabel: "Operator",
      content: "@main 给我完整的三个视频开头。",
      targetParticipantIds: ["main"],
      mentionTargets: [{ participantId: "main" }],
      createdAt: new Date().toISOString(),
    } as never,
    mode: "discussion",
  });

  assert.equal(result.suppressVisibleMessage, true);
  assert.equal(result.content, "");
  assert.equal(result.chainDirective?.nextAction, "continue");
  assert.match(result.chainDirective?.nextStep ?? "", /完整可口播的视频开头/);
});

test("explicit @pandas repo scan request in discussion hides abstract summaries until concrete file findings appear", async () => {
  const result = await dispatchHallRuntimeTurn({
    client: {
      agentRun: async () => ({
        ok: true,
        text: "群聊功能已经收清了：它把讨论、分工、owner 收口和 next action 串成一个可见推进线程。",
        rawText: "",
      }),
    } as never,
    hall: {
      hallId: "hall",
      participants: [
        {
          participantId: "pandas",
          displayName: "pandas",
          semanticRole: "coder",
          aliases: [],
          active: true,
        },
      ],
      updatedAt: new Date().toISOString(),
    } as never,
    taskCard: {
      taskCardId: "card",
      hallId: "hall",
      projectId: "project",
      taskId: "task",
      title: "请先扫描 control-center 代码",
      description: "请先扫描 control-center 代码",
      stage: "discussion",
      status: "todo",
      plannedExecutionOrder: [],
      plannedExecutionItems: [],
      mentionedParticipantIds: [],
      sessionKeys: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never,
    participant: {
      participantId: "pandas",
      displayName: "pandas",
      semanticRole: "coder",
      aliases: [],
      active: true,
    } as never,
    triggerMessage: {
      hallId: "hall",
      messageId: "trigger",
      kind: "chat",
      authorParticipantId: "operator",
      authorLabel: "Operator",
      content: "@pandas 去扫一下 control-center 代码，然后告诉我 hall-chat 的 3 个关键入口文件。",
      targetParticipantIds: ["pandas"],
      mentionTargets: [{ participantId: "pandas" }],
      createdAt: new Date().toISOString(),
    } as never,
    mode: "discussion",
  });

  assert.equal(result.suppressVisibleMessage, true);
  assert.equal(result.content, "");
  assert.equal(result.chainDirective?.nextAction, "continue");
});

test("brand-new untargeted repo scan asks still start with normal discussion instead of strict direct-deliverable mode", async () => {
  let capturedPrompt = "";
  const result = await dispatchHallRuntimeTurn({
    client: {
      agentRun: async (request: { message: string }) => {
        capturedPrompt = request.message;
        return {
          ok: true,
          text: "先把入口收成三层：UI、orchestrator、runtime，再决定执行顺序。",
          rawText: "",
        };
      },
    } as never,
    hall: {
      hallId: "hall",
      participants: [
        {
          participantId: "coq",
          displayName: "Coq-每日新闻",
          semanticRole: "planner",
          aliases: [],
          active: true,
        },
      ],
      updatedAt: new Date().toISOString(),
    } as never,
    taskCard: {
      taskCardId: "card",
      hallId: "hall",
      projectId: "project",
      taskId: "task",
      title: "请先扫描 control-center 代码",
      description: "请先扫描 control-center 代码",
      stage: "discussion",
      status: "todo",
      plannedExecutionOrder: [],
      plannedExecutionItems: [],
      mentionedParticipantIds: [],
      sessionKeys: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never,
    participant: {
      participantId: "coq",
      displayName: "Coq-每日新闻",
      semanticRole: "planner",
      aliases: [],
      active: true,
    } as never,
    triggerMessage: {
      hallId: "hall",
      messageId: "trigger",
      kind: "chat",
      authorParticipantId: "operator",
      authorLabel: "Operator",
      content: "请先扫描 control-center 代码，找出 hall-chat 的 3 个关键入口文件，并说明每个文件负责什么。",
      createdAt: new Date().toISOString(),
    } as never,
    recentThreadMessages: [],
    mode: "discussion",
  });

  assert.doesNotMatch(capturedPrompt, /Direct ask you must satisfy now/i);
  assert.doesNotMatch(capturedPrompt, /Prioritize this current ask over your default semantic role/i);
  assert.equal(result.suppressVisibleMessage, undefined);
  assert.match(result.content, /UI、orchestrator、runtime/);
});
