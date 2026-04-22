import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import ChatPanel from "./ChatPanel";

export default function ChatDrawer() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const hideOnChat = location.pathname.startsWith("/chat");

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
        className="group fixed bottom-8 right-8 z-40 flex items-center gap-2 rounded-full border border-forest/20 bg-forest px-5 py-3 text-[13px] font-medium tracking-tight text-raised shadow-lift transition-all duration-300 ease-out-gentle hover:bg-forest-dark hover:shadow-drawer focus:outline-none focus-visible:ring-2 focus-visible:ring-forest/40"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-soft-breathe rounded-full bg-sun-soft/50" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-sun" />
        </span>
        <span className="font-sans">Ask Design Office</span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="chat-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.aside
              key="chat-drawer"
              initial={{ x: 500, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 500, opacity: 0 }}
              transition={{ type: "spring", damping: 32, stiffness: 280 }}
              role="dialog"
              aria-label="Ask Design Office"
              className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[480px] flex-col border-l border-hairline bg-canvas shadow-drawer"
            >
              <ChatPanel mode="drawer" onClose={() => setOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
