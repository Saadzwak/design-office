import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import Icon from "../ui/Icon";
import ChatPanel from "./ChatPanel";

type Props = {
  /** External open state. When undefined, the drawer self-manages via
   *  an internal trigger button (legacy behaviour). */
  open?: boolean;
  /** Called when the drawer requests a state change. */
  onOpenChange?: (next: boolean) => void;
  /** Callback for the "expand to fullpage" action. */
  onExpand?: () => void;
  /** When true (legacy), render the ChatDrawer's own floating trigger.
   *  When false / undefined while `open` is controlled, the trigger is
   *  expected to live outside (see `App.tsx`). */
  renderTrigger?: boolean;
};

/**
 * ChatDrawer — right-edge sliding panel with the Ask-Design-Office chat.
 *
 * Dual-mode :
 * - Uncontrolled (legacy) : renders its own circular trigger and owns
 *   the open/close state. Used only when App.tsx does not wire the
 *   bundle-parity floating button.
 * - Controlled : `open` + `onOpenChange` + `onExpand` come from App.
 *   The bundle's floating 56 px circular "breathe" button lives there.
 *
 * Always hides on `/chat` (the fullpage lives on the route itself).
 */
export default function ChatDrawer({
  open: controlledOpen,
  onOpenChange,
  onExpand,
  renderTrigger,
}: Props = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? !!controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    if (!isControlled) setInternalOpen(next);
  };

  const location = useLocation();
  const hideOnChat = location.pathname.startsWith("/chat");

  // Default trigger rendering : when no controlled parent AND caller
  // didn't explicitly opt out, we render our own trigger.
  const showOwnTrigger =
    renderTrigger === true || (!isControlled && renderTrigger !== false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (hideOnChat) return null;

  return (
    <>
      {showOwnTrigger && (
        <button
          onClick={() => setOpen(!open)}
          aria-label="Open Ask Design Office"
          className="fixed bottom-7 right-7 z-40 flex h-14 w-14 items-center justify-center rounded-full animate-soft-breathe transition-all duration-300 ease-out-gentle hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-forest/40"
          style={{
            background: "var(--forest)",
            color: "var(--canvas)",
            boxShadow: "0 8px 24px rgba(47, 74, 63, 0.35)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
          }}
        >
          <Icon name="messages-square" size={20} />
        </button>
      )}

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="chat-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-0 z-40 backdrop-blur-sm"
              style={{ background: "rgba(250, 247, 242, 0.55)" }}
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
              className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[480px] flex-col border-l border-mist-200 bg-canvas shadow-drawer"
            >
              <ChatPanel
                mode="drawer"
                onClose={() => setOpen(false)}
                onExpand={onExpand}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
