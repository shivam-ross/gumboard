"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";

export interface ChecklistItem {
  id: string;
  content: string;
  checked: boolean;
  order: number;
}

interface ChecklistItemProps {
  item: ChecklistItem;
  onToggle?: (itemId: string) => void;
  onEdit?: (itemId: string, content: string) => void;
  onDelete?: (itemId: string) => void;
  isEditing?: boolean;
  editContent?: string;
  onEditContentChange?: (content: string) => void;
  onStartEdit?: (itemId: string) => void;
  onStopEdit?: () => void;
  readonly?: boolean;
  showDeleteButton?: boolean;
  className?: string;
  isNewItem?: boolean;
  onCreateItem?: (content: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function ChecklistItem({
  item,
  onToggle,
  onEdit,
  onDelete,
  isEditing,
  editContent,
  onEditContentChange,
  onStartEdit,
  onStopEdit,
  readonly = false,
  showDeleteButton = true,
  className,
  isNewItem = false,
  onCreateItem,
  textareaRef,
}: ChecklistItemProps) {
  const internalTextareaRef = React.useRef<HTMLTextAreaElement>(null);
  const actualTextareaRef = textareaRef || internalTextareaRef;
  const previousContentRef = React.useRef<string>("");
  const deletingRef = React.useRef<boolean>(false);

  const adjustTextareaHeight = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  };

  React.useEffect(() => {
    if (isEditing && actualTextareaRef.current) {
      adjustTextareaHeight(actualTextareaRef.current);
      previousContentRef.current = editContent ?? item.content;
    }
  }, [isEditing, editContent, item.content, actualTextareaRef]);

  React.useEffect(() => {
    if (!isEditing && actualTextareaRef.current) {
      adjustTextareaHeight(actualTextareaRef.current);
    }
  }, [item.content, isEditing, actualTextareaRef]);
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isNewItem && editContent?.trim() && onCreateItem) {
        onCreateItem(editContent.trim());
      } else {
        const target = e.target as HTMLTextAreaElement;
        target.blur();
      }
    }
    if (e.key === "Enter" && e.shiftKey) {
      const target = e.target as HTMLTextAreaElement;
      setTimeout(() => adjustTextareaHeight(target), 0);
    }
    if (e.key === "Escape") {
      onStopEdit?.();
    }
    if (e.key === "Backspace" && editContent?.trim() === "") {
      e.preventDefault();
      onDelete?.(item.id);
    }
  };

  const handleBlur = () => {
    if (deletingRef.current) {
      deletingRef.current = false;
      return;
    }
    if (isNewItem && editContent?.trim() && onCreateItem) {
      onCreateItem(editContent.trim());
    } else if (isEditing && editContent !== undefined && onEdit) {
      onEdit(item.id, editContent);
    }
    onStopEdit?.();
  };

  return (
    <div
      className={cn(
        "flex items-start group/item rounded gap-2 transition-all duration-200",
        className
      )}
      // To avoid flaky test locators
      data-testid={process.env.NODE_ENV !== "production" ? item.id : undefined}
      data-testorder={process.env.NODE_ENV !== "production" ? item.order : undefined}
    >
      <Checkbox
        checked={item.checked}
        onCheckedChange={() => !readonly && onToggle?.(item.id)}
        className="border-zinc-500 bg-white/50 dark:bg-zinc-800 dark:border-zinc-600 mt-1.5 text-zinc-900 dark:text-zinc-100"
        disabled={readonly}
      />

      <textarea
        ref={actualTextareaRef}
        value={editContent ?? item.content}
        onChange={(e) => onEditContentChange?.(e.target.value)}
        disabled={readonly}
        className={cn(
          "flex-1 border-none bg-transparent px-1 py-1 text-sm text-zinc-900 dark:text-zinc-100 resize-none overflow-hidden outline-none",
          item.checked && "text-zinc-500 dark:text-zinc-500 line-through"
        )}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onFocus={(e) => {
          if (isEditing) {
            const originalScrollIntoView = e.target.scrollIntoView;
            e.target.scrollIntoView = () => {};
            setTimeout(() => {
              e.target.scrollIntoView = originalScrollIntoView;
            }, 100);
          }

          if (!isEditing && !readonly) {
            onStartEdit?.(item.id);
          }
        }}
        rows={1}
        style={{ height: "auto" }}
        onInput={(e) => {
          const target = e.target as HTMLTextAreaElement;
          const currentContent = target.value;

          if (currentContent !== previousContentRef.current) {
            adjustTextareaHeight(target);
            previousContentRef.current = currentContent;
          }
        }}
      />

      {showDeleteButton && !readonly && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-50 rounded-sm hover:bg-white/20 md:opacity-0 md:group-hover/item:opacity-50 md:hover:opacity-100 text-zinc-500 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
          onMouseDown={() => {
            deletingRef.current = true;
          }}
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.(item.id);
          }}
        >
          <Trash2 className="h-3 w-3" />
          <span className="sr-only">Delete item</span>
        </Button>
      )}
    </div>
  );
}
