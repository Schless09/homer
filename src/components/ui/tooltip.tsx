"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

function TooltipContent({ className, sideOffset = 6, children, ...props }: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 rounded-md bg-primary px-2.5 py-1.5 text-xs text-primary-foreground shadow-md animate-in fade-in-0 zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

/** Convenience wrapper: <Tip label="Undo" shortcut="⌘Z"><Button/></Tip> */
function Tip({ label, shortcut, side, children }: { label: React.ReactNode; shortcut?: string; side?: "top" | "bottom" | "left" | "right"; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>
        <span>{label}</span>
        {shortcut && <kbd className="ml-2 rounded bg-white/15 px-1 font-mono text-[10px]">{shortcut}</kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Tip };
