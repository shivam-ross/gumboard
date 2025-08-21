"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

import {
  ChecklistItem as ChecklistItemComponent,
  ChecklistItem,
} from "@/components/checklist-item";
import { DraggableRoot, DraggableContainer, DraggableItem } from "@/components/ui/draggable";
import { cn } from "@/lib/utils";
import { Trash2, Archive, ArchiveRestore, Copy } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

// Core domain types
export interface User {
  id: string;
  name: string | null;
  image?: string | null;
  email: string;
  isAdmin?: boolean;
}

export interface Board {
  id: string;
  name: string;
  description: string | null;
}

export interface Note {
  id: string;
  color: string;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  checklistItems?: ChecklistItem[];
  user: {
    id: string;
    name: string | null;
    email: string;
    image?: string | null;
  };
  board?: {
    id: string;
    name: string;
  };
  boardId: string;
  // Optional positioning properties for board layout
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface NoteProps {
  note: Note;
  syncDB?: boolean;
  currentUser?: User;
  onUpdate?: (note: Note) => void;
  onDelete?: (noteId: string) => void;
  onArchive?: (noteId: string) => void;
  onUnarchive?: (noteId: string) => void;
  onCopy?: (note: Note) => void;
  readonly?: boolean;
  showBoardName?: boolean;
  className?: string;
  style?: React.CSSProperties;
  autoFocusNewItem?: boolean;
  onAutoFocusComplete?: () => void;
  textonStart?: string;
}

export function Note({
  note,
  currentUser,
  onUpdate,
  onDelete,
  onArchive,
  onUnarchive,
  onCopy,
  readonly = false,
  showBoardName = false,
  className,
  syncDB = true,
  style,
  autoFocusNewItem = false,
  onAutoFocusComplete,
  textonStart
}: NoteProps) {
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editingItemContent, setEditingItemContent] = useState("");
  const [newItemContent, setNewItemContent] = useState("");
  const newItemRef = useRef<HTMLTextAreaElement>(null);

  const canEdit = !readonly && (currentUser?.id === note.user.id || currentUser?.isAdmin);

  useEffect(() => {
    if( textonStart && newItemRef.current ) {
      newItemRef.current.value = textonStart;
      setNewItemContent(textonStart);
    }
  },[textonStart]);

  // Auto-focus new item when autoFocusNewItem prop is true
  useEffect(() => {
    if (autoFocusNewItem && canEdit && newItemRef.current) {
      // Small delay to ensure DOM is ready
      const timeoutId = setTimeout(() => {
        newItemRef.current?.focus();
        onAutoFocusComplete?.();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [autoFocusNewItem, canEdit, onAutoFocusComplete]);
  

  const handleToggleChecklistItem = async (itemId: string) => {
    try {
      if (!note.checklistItems) return;

      const updatedItems = note.checklistItems.map((item) =>
        item.id === itemId ? { ...item, checked: !item.checked } : item
      );

      const sortedItems = updatedItems.sort((a, b) => a.order - b.order);

      const optimisticNote = {
        ...note,
        checklistItems: sortedItems,
      };

      onUpdate?.(optimisticNote);

      if (syncDB) {
        fetch(`/api/boards/${note.boardId}/notes/${note.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            checklistItems: sortedItems,
          }),
        })
          .then(async (response) => {
            if (!response.ok) {
              console.error("Server error, reverting optimistic update");
              onUpdate?.(note);
            } else {
              const { note: updatedNote } = await response.json();
              onUpdate?.(updatedNote);
            }
          })
          .catch((error) => {
            console.error("Error toggling checklist item:", error);
            onUpdate?.(note);
          });
      }
    } catch (error) {
      console.error("Error toggling checklist item:", error);
    }
  };

  const handleDeleteChecklistItem = async (itemId: string) => {
    try {
      if (!note.checklistItems) return;
      const updatedItems = note.checklistItems.filter((item) => item.id !== itemId);

      const optimisticNote = {
        ...note,
        checklistItems: updatedItems,
      };

      onUpdate?.(optimisticNote);

      if (syncDB) {
        const response = await fetch(`/api/boards/${note.boardId}/notes/${note.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            checklistItems: updatedItems,
          }),
        });

        if (response.ok) {
          const { note: updatedNote } = await response.json();
          onUpdate?.(updatedNote);
        } else {
          onUpdate?.(note);
        }
      }
    } catch (error) {
      console.error("Error deleting checklist item:", error);
    }
  };

  const handleEditChecklistItem = async (itemId: string, content: string) => {
    try {
      if (!note.checklistItems) return;

      const updatedItems = note.checklistItems.map((item) =>
        item.id === itemId ? { ...item, content } : item
      );

      const optimisticNote = {
        ...note,
        checklistItems: updatedItems,
      };

      onUpdate?.(optimisticNote);

      if (syncDB) {
        const response = await fetch(`/api/boards/${note.boardId}/notes/${note.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            checklistItems: updatedItems,
          }),
        });

        if (response.ok) {
          const { note: updatedNote } = await response.json();
          onUpdate?.(updatedNote);
        } else {
          onUpdate?.(note);
        }
      }
    } catch (error) {
      console.error("Error editing checklist item:", error);
    }
  };

  const handleReorderChecklistItems = async (noteId: string, newItems: ChecklistItem[]) => {
    try {
      if (!note.checklistItems) return;
      const allItemsChecked = newItems.every((item) => item.checked);
      // Disallow unchecked items to be after checked items
      const firstCheckedIndex = newItems.findIndex((element) => element.checked);
      const lastUncheckedIndex = newItems.map((element) => element.checked).lastIndexOf(false);
      if (
        firstCheckedIndex !== -1 &&
        lastUncheckedIndex !== -1 &&
        lastUncheckedIndex > firstCheckedIndex
      ) {
        return;
      }

      const updatedItems = newItems.map((item, index) => ({ ...item, order: index }));

      const optimisticNote = {
        ...note,
        checklistItems: updatedItems,
      };

      onUpdate?.(optimisticNote);

      if (syncDB) {
        const response = await fetch(`/api/boards/${note.boardId}/notes/${noteId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            checklistItems: updatedItems,
            archivedAt: allItemsChecked ? new Date().toISOString() : null,
          }),
        });

        if (response.ok) {
          const { note: updatedNote } = await response.json();
          onUpdate?.(updatedNote);
        } else {
          onUpdate?.(note);
        }
      }
    } catch (error) {
      console.error("Failed to reorder checklist item:", error);
    }
  };

  const handleAddChecklistItem = async (content: string) => {
    try {
      const newItem = {
        id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        content,
        checked: false,
        order: note.checklistItems?.length ?? 0,
      };

      const allItemsChecked = [...(note.checklistItems || []), newItem].every(
        (item) => item.checked
      );

      const optimisticNote = {
        ...note,
        checklistItems: [...(note.checklistItems || []), newItem],
        archivedAt: allItemsChecked ? new Date().toISOString() : null,
      };

      onUpdate?.(optimisticNote);

      if (syncDB) {
        const response = await fetch(`/api/boards/${note.boardId}/notes/${note.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            checklistItems: [...(note.checklistItems || []), newItem],
          }),
        });

        if (response.ok) {
          const { note: updatedNote } = await response.json();
          onUpdate?.(updatedNote);
        } else {
          onUpdate?.(note);
        }
      }
    } catch (error) {
      console.error("Error adding checklist item:", error);
    }
  };

  const handleStartEditItem = (itemId: string) => {
    const item = note.checklistItems?.find((i) => i.id === itemId);
    if (item && canEdit) {
      setEditingItem(itemId);
      setEditingItemContent(item.content);
    }
  };

  const handleStopEditItem = () => {
    setEditingItem(null);
    setEditingItemContent("");
  };

  const handleEditItem = (itemId: string, content: string) => {
    handleEditChecklistItem(itemId, content);
    handleStopEditItem();
  };

  const handleDeleteItem = (itemId: string) => {
    handleDeleteChecklistItem(itemId);
    handleStopEditItem();
  };

  const handleCreateNewItem = (content: string) => {
    if (content.trim()) {
      handleAddChecklistItem(content.trim());
      setNewItemContent("");
    }
  };

  return (
    <div
      className={cn(
        "relative select-none group transition-shadow duration-200 flex flex-col dark:border-gray-600 dark:bg-zinc-900 box-border",
        // Focus highlight when any child is focused/being typed into
        "focus-within:ring-2 focus-within:ring-sky-500 dark:focus-within:ring-sky-400 focus-within:ring-offset-1 focus-within:ring-offset-white dark:focus-within:ring-offset-zinc-900",
        // Light theme variant
        "shadow-[-5px_14px_20px_-12px_rgba(0,0,0,0.18),_5px_14px_20px_-12px_rgba(0,0,0,0.18),_0_24px_40px_-22px_rgba(0,0,0,0.12)]",
        // Dark theme variant
        "dark:shadow-[-5px_14px_20px_-12px_rgba(0,0,0,0.38),_5px_14px_20px_-12px_rgba(0,0,0,0.38),_0_26px_42px_-22px_rgba(0,0,0,0.24)]",
        // Minimal top sticky shade
        "before:content-[''] before:absolute before:inset-x-0 before:top-0 before:h-1 before:opacity-20 before:pointer-events-none",
        "before:bg-gradient-to-b before:from-black/5 before:to-transparent dark:before:from-white/5",
        className
      )}
      data-testid="note-card"
      onFocusCapture={() => {}}
      onBlurCapture={() => {}}
      style={style}
    >
      <div className="flex items-start justify-between mb-2 flex-shrink-0">
        <div className="flex items-center space-x-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-white/50 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-sm font-semibold">
              {note.user.name
                ? note.user.name.charAt(0).toUpperCase()
                : note.user.email.charAt(0).toUpperCase()}
            </AvatarFallback>
            <AvatarImage
              className="border-1 rounded-full border-zinc-50/50 dark:border-zinc-800"
              src={note.user.image ? note.user.image : undefined}
              alt={note.user.name || ""}
            />
          </Avatar>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-gray-700 dark:text-zinc-100 truncate max-w-20">
              {note.user.name ? note.user.name.split(" ")[0] : note.user.email.split("@")[0]}
            </span>
            <div className="flex flex-col">
              {showBoardName && note.board && (
                <Link
                  href={`/boards/${note.board.id}`}
                  className="text-xs text-blue-600 dark:text-blue-400 opacity-80 font-medium truncate max-w-20 hover:opacity-100 transition-opacity"
                >
                  {note.board.name}
                </Link>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex space-x-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            {canEdit && !note.archivedAt && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={`Copy Note ${note.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCopy?.(note);
                    }}
                    className="p-1 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-white/20 rounded"
                    variant="ghost"
                    size="icon"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Copy note</p>
                </TooltipContent>
              </Tooltip>
            )}
            {canEdit && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={`Delete Note ${note.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete?.(note.id);
                    }}
                    className="p-1 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-white/20 rounded"
                    variant="ghost"
                    size="icon"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Delete note</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {canEdit && onArchive && (
            <div className="flex items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onArchive(note.id);
                    }}
                    className="p-1 text-zinc-600 hover:text-zinc-900 dark:text-gray-400 dark:hover:text-white hover:bg-white/20 rounded"
                    variant="ghost"
                    size="icon"
                    aria-label="Archive note"
                  >
                    <Archive className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Archive note</p>
                </TooltipContent>
              </Tooltip>
            </div>
          )}
          {canEdit && onUnarchive && (
            <div className="flex items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnarchive(note.id);
                    }}
                    className="p-1 text-zinc-600 dark:text-zinc-400 hover:text-green-600 dark:hover:text-green-400 rounded"
                    variant="ghost"
                    size="icon"
                    aria-label="Unarchive note"
                  >
                    <ArchiveRestore className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Unarchive note</p>
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col">
        <div className="overflow-y-auto space-y-1">
          {/* Checklist Items */}
          <DraggableRoot
            items={note.checklistItems ?? []}
            onItemsChange={(newItems) => {
              if (canEdit) {
                handleReorderChecklistItems(note.id, newItems);
              }
            }}
          >
            <DraggableContainer className="space-y-1">
              {note.checklistItems?.map((item) => (
                <DraggableItem key={item.id} id={item.id} disabled={!canEdit}>
                  <ChecklistItemComponent
                    item={item}
                    onToggle={handleToggleChecklistItem}
                    onEdit={handleEditItem}
                    onDelete={handleDeleteItem}
                    isEditing={editingItem === item.id}
                    editContent={editingItem === item.id ? editingItemContent : undefined}
                    onEditContentChange={setEditingItemContent}
                    onStartEdit={handleStartEditItem}
                    onStopEdit={handleStopEditItem}
                    readonly={readonly}
                    showDeleteButton={canEdit}
                  />
                </DraggableItem>
              ))}
            </DraggableContainer>

            {/* Always-available New Item Input */}
            {canEdit && (
              <>
              <ChecklistItemComponent
                item={{
                  id: "new-item",
                  content: newItemContent,
                  checked: false,
                  order: 0,
                }}
                onEdit={() => {}}
                onDelete={() => {
                  setNewItemContent("");
                }}
                isEditing={true}
                editContent={newItemContent}
                onEditContentChange={setNewItemContent}
                onStopEdit={() => {
                  if (!newItemContent.trim()) {
                    setNewItemContent("");
                  }
                }}
                isNewItem={true}
                onCreateItem={handleCreateNewItem}
                readonly={false}
                showDeleteButton={false}
                className="gap-3"
                textareaRef={newItemRef}
              />

              {newItemContent.trim().length > 0 && (
                  <ChecklistItemComponent
                    item={{
                      id: "new-item-additional",
                      content: "",
                      checked: false,
                      order: 1,
                    }}
                    onEdit={() => {}}
                    onDelete={() => {}}
                    isEditing={true}
                    editContent=""
                    onEditContentChange={() => {}}
                    onStopEdit={() => {}}
                    isNewItem={true}
                    onCreateItem={(content) => {
                      if (content.trim()) {
                        handleAddChecklistItem(content.trim());
                      }
                    }}
                    readonly={false}
                    showDeleteButton={false}
                    className="gap-3"
                  />
                )}
              </>
            )}
          </DraggableRoot>
        </div>
      </div>
    </div>
  );
}
