import { ThemeToggle } from "./theme-toggle";

export function TopBar({ title }: { title: string }) {
  return (
    <div className="border-b relative px-3 h-16 flex items-center justify-between">
      <div className="max-w-4xl w-full mx-auto px-3 flex items-center justify-between h-16">
        <div className="flex items-center gap-8">
          <h1 className="lg:text-2xl sm:text-xl text-lg font-bold">{title}</h1>
        </div>
      </div>
      <ThemeToggle />
    </div>
  );
}
