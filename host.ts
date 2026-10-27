import type { CanvasHost, ConversationReply } from "./mirador/api.ts";

/** Past this, the agent gets the start of the reply and a pointer to the conversation, which keeps all of it. */
export const REPLY_LIMIT = 8000;

const ASK_FOR_A_SHORT_ANSWER =
  "\n\n---\nAn agent in another conversation delegated this task to you. End with a short, plain answer: your last message goes back to it.";

interface DelegateInput {
  profile: string;
  task: string;
}

function cappedReply(text: string, conversationId: string) {
  if (text.length <= REPLY_LIMIT) return text;
  return `${text.slice(0, REPLY_LIMIT)}\n\n[Cut at ${REPLY_LIMIT} characters; conversation ${conversationId} has the whole reply.]`;
}

export function replyMessage(profile: string, conversationId: string, { text, ended }: ConversationReply) {
  const heading = `The task delegated to ${profile} (conversation ${conversationId}) ${ended}.`;
  const verify = "Treat it as leads to check, not as verified.";
  if (text === null) return `${heading} Its agent said nothing in words.`;
  return `${heading} ${verify} Its agent's last message:\n\n${cappedReply(text, conversationId)}`;
}

const host: CanvasHost = {
  items: {},
  tools: {
    delegate: {
      description:
        "Hand a self-contained task to a new conversation on another profile, such as one running a local model, in this workspace. Returns at once; that conversation's final reply arrives as your next message. The task must stand on its own: the other agent sees nothing of this conversation.",
      input: {
        type: "object",
        properties: {
          profile: { type: "string", minLength: 1, description: "The Mirador profile to run it on, by name, e.g. the one the user named." },
          task: { type: "string", minLength: 1, description: "Everything the other agent needs: what to do, which files or commands, and what to answer with." },
        },
        required: ["profile", "task"],
      },
      async run(input, context) {
        const { profile, task } = input as DelegateInput;
        const started = await context.startConversation({ profile, prompt: `${task}${ASK_FOR_A_SHORT_ANSWER}` });
        return `Started conversation ${started.id} on ${started.profile}. Its reply comes as your next message; carry on with other work meanwhile, or end your turn.`;
      },
    },
  },
  async replied(started, reply, context) {
    await context.prompt(replyMessage(started.profile, started.id, reply), { afterTurn: true });
  },
  guidance: {
    instructions:
      "- delegate: hand an easy, self-contained task to a conversation on another profile, such as a local model, when the user asks or when it reads a lot but answers in a few lines: summarise files or logs, find where something happens, triage a list, draft boilerplate. Its reply arrives as your next message; check it before relying on it.",
    often: "- delegate: when the user asks, or for an easy task that reads a lot and answers in a few lines.",
  },
};

export default host;
