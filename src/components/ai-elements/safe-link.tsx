"use client";

import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { ExternalLinkIcon, XIcon } from "lucide-react";
import { type ComponentProps, memo, useCallback, useState } from "react";

type SafeLinkProps = ComponentProps<"a">;

export const SafeLink = memo(
  ({ children, className, href, ...props }: SafeLinkProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const isIncomplete = href === "streamdown:incomplete-link";
    const isExternal =
      href?.startsWith("http://") || href?.startsWith("https://");

    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        if (isExternal && !isIncomplete) {
          e.preventDefault();
          setIsOpen(true);
        }
      },
      [isExternal, isIncomplete]
    );

    const handleConfirm = useCallback(() => {
      if (href) {
        window.open(href, "_blank", "noreferrer");
      }
      setIsOpen(false);
    }, [href]);

    if (!isExternal) {
      return (
        <a
          className={cn(
            "font-medium text-primary underline break-words",
            className
          )}
          href={href}
          {...props}
        >
          {children}
        </a>
      );
    }

    return (
      <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
        <Dialog.Trigger asChild>
          <span
            role="button"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setIsOpen(true);
              }
            }}
            className={cn(
              "font-medium text-primary underline break-words cursor-pointer",
              className
            )}
            data-incomplete={isIncomplete}
            data-streamdown="link"
          >
            {children}
          </span>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
            <Dialog.Title className="flex items-center gap-2 text-lg font-semibold">
              <ExternalLinkIcon className="size-5" />
              Open external link?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              You are about to open an external link. This will take you to:
            </Dialog.Description>
            <div className="mt-3 rounded-md bg-muted p-3">
              <p className="break-all text-sm font-mono">{href}</p>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={handleConfirm}
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Open link
              </button>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100"
                aria-label="Close"
              >
                <XIcon className="size-4" />
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }
);

SafeLink.displayName = "SafeLink";
