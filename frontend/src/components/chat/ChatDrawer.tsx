import { AnimatePresence, motion } from "framer-motion";
import { MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import ChatPanel from "./ChatPanel";

export default function ChatDrawer() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Hide the floating trigger on the full-page /chat route — the main
  // panel already owns the whole viewport there.
  const hideOnChat = location.pathname.startsWith("/chat");

  // Close the drawer on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (hideOnChat) return null;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Open Ask Design Office"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-terracotta text-ink shadow-soft-lg transition-transform duration-200 ease-out-expo hover:scale-105 focus:outline-none focus:ring-2 focus:ring-terracotta/60"
      >
        <MessageSquare className="h-6 w-6" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="chat-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-ink/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.aside
              key="chat-drawer"
              initial={{ x: 460 }}
              animate={{ x: 0 }}
              exit={{ x: 460 }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              role="dialog"
              aria-label="Ask Design Office"
              className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[460px] flex-col border-l border-neutral-500/30 bg-ink shadow-soft-lg"
            >
              <ChatPanel mode="drawer" onClose={() => setOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
