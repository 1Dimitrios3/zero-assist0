"use client";

import { cn } from "@/lib/utils";
import { type ComponentProps, memo, useMemo } from "react";
import { Streamdown } from "streamdown";
import { SafeLink } from "./safe-link";

type ResponseProps = ComponentProps<typeof Streamdown>;

export const Response = memo(
  ({ className, components, ...props }: ResponseProps) => {
    const mergedComponents = useMemo(
      () => ({
        a: SafeLink,
        ...components,
      }),
      [components]
    );

    return (
      <Streamdown
        shikiTheme={["light-plus", "dark-plus"]}
        components={mergedComponents}
        className={cn(
          "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          className
        )}
        {...props}
      />
    );
  },
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

Response.displayName = "Response";
