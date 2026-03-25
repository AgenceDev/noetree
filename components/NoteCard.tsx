import { useState, useRef, useEffect } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "./ui/context-menu";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import { cn } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";
import { NoteTree, useTreeContext } from "@/providers/TreeProvider";
import { useEditorContext } from "@/providers/EditorProvider";
import ConditionChecker from "./helpers/ConditionChecker";

interface NoteCardProps {
  note: NoteTree;
  isRoot: boolean;
  onAddChild: () => void;
  onDelete: () => void;
}

export function NoteCard({
  note,
  isRoot,
  onAddChild,
  onDelete,
}: NoteCardProps) {
  const { onSelectNote, onUpdateNoteTitle, selectedNote } = useTreeContext();
  const { getCurrentContent } = useEditorContext();

  const [isRenaming, setIsRenaming] = useState(false);
  const [editedTitle, setEditedTitle] = useState(note.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const isSelected = selectedNote?._id === note._id;

  useEffect(() => {
    if (isRenaming) {
      setEditedTitle(note.title);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isRenaming, note.title]);

  const handleSaveRename = () => {
    if (editedTitle.trim() !== "" && editedTitle !== note.title) {
      onUpdateNoteTitle(note._id, editedTitle);
    }
    setIsRenaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSaveRename();
    }
    if (e.key === "Escape") {
      setIsRenaming(false);
      setEditedTitle(note.title);
    }
  };

  return (
    <div className="relative group/node">
      <ContextMenu>
        <ContextMenuTrigger disabled={isRenaming}>
          <Card
            className={cn(
              "cursor-pointer transition-all hover:bg-accent/50 group border-border shadow-md min-w-[160px] max-w-[240px] relative overflow-hidden",
              isSelected
                ? "bg-accent border-primary ring-2 ring-primary/20"
                : "bg-background",
            )}
            onClick={() => !isRenaming && onSelectNote(note, getCurrentContent)}
            onDoubleClick={() => setIsRenaming(true)}
          >
            <div className="flex flex-col items-center p-3">
              <ConditionChecker condition={isRenaming}>
                <Input
                  ref={inputRef}
                  type="text"
                  value={editedTitle}
                  onChange={e => setEditedTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleSaveRename}
                  onClick={e => e.stopPropagation()}
                  className="h-auto text-sm font-semibold bg-transparent! text-center border-none p-0 focus-visible:ring-0"
                />
              </ConditionChecker>
              <ConditionChecker condition={!isRenaming}>
                <span className="truncate text-sm font-semibold text-center">
                  {note.title}
                </span>
              </ConditionChecker>

              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={e => {
                    e.stopPropagation();
                    onAddChild();
                  }}
                  title="Add child note"
                >
                  <Plus className="h-3 w-3" />
                </Button>
                <ConditionChecker condition={!isRoot}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 hover:text-destructive"
                    onClick={e => {
                      e.stopPropagation();
                      onDelete();
                    }}
                    title="Delete note"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </ConditionChecker>
              </div>
            </div>
          </Card>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={onAddChild}>
            Add a child note
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setIsRenaming(true)}>
            Rename
          </ContextMenuItem>
          <ConditionChecker condition={!isRoot}>
            <ContextMenuItem variant="destructive" onClick={onDelete}>
              Delete
            </ContextMenuItem>
          </ConditionChecker>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
