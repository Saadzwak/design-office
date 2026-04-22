import ChatPanel from "../components/chat/ChatPanel";

export default function Chat() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="h-[calc(100vh-8rem)] overflow-hidden rounded-2xl border border-neutral-500/20 bg-neutral-800/10">
        <ChatPanel mode="fullpage" />
      </div>
    </div>
  );
}
