import { Editor } from "@tiptap/core";
import { Content, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState
} from "react";
import { useDebouncedCallback } from "use-debounce";
import { useTreeContext } from "./TreeProvider";

type saveStatusType = "idle" | "unsaved" | "saving" | "success" | "error";

interface EditorContextType {
  editor: Editor | null;
  saveStatus: saveStatusType;
  getCurrentContent: () => string | null;
}

const EditorContext = createContext<EditorContextType>({
  editor: null,
  saveStatus: "idle",
  getCurrentContent: () => null
});

export const useEditorContext = (): EditorContextType => {
  const context = useContext(EditorContext);
  if (!context)
    throw new Error("useEditorContext must be used within an EditorProvider");
  return context;
};

interface EditorProviderProps {
  children: ReactNode;
}

export function EditorProvider({ children }: Readonly<EditorProviderProps>) {
  const { selectedNote, onUpdateNoteContent } = useTreeContext();

  const [saveStatus, setSaveStatus] = useState<saveStatusType>("idle");

  const editor = useEditor({
    content: "",
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Write something…"
      }),
      Link,
      Image
    ],
    editorProps: {
      attributes: {
        class: "flex-1 overflow-y-auto border rounded-md p-4"
      }
    },
    immediatelyRender: true
  });

  // Load content when selectedNote changes - reset editor completely
  useEffect(() => {
    if (!editor || !selectedNote) return;

    // Parse the content from the database
    let content = "";
    try {
      if (selectedNote.content && typeof selectedNote.content === "string") {
        // If content is a JSON string, parse it
        content = JSON.parse(selectedNote.content);
      } else if (selectedNote.content) {
        // If content is already an object
        content = selectedNote.content;
      }
    } catch (error) {
      console.warn("Failed to parse note content, using empty content:", error);
      content = "";
    }

    // Clear the editor completely and reset its state like setAsPristine
    editor.commands.clearContent();
    editor.commands.setContent(content);

    // Clear the history by destroying and recreating the history extension
    // This is equivalent to setAsPristine - completely reset the editor state
    editor.extensionManager.extensions.forEach(extension => {
      if (extension.name === "history") {
        const historyExtension = extension as any;
        if (historyExtension.storage?.history) {
          historyExtension.storage.history.done = [];
          historyExtension.storage.history.undone = [];
        }
      }
    });

    // Reset save status
    setSaveStatus("idle");
  }, [editor, selectedNote]);

  const debouncedSave = useDebouncedCallback(async (content: Content) => {
    if (!selectedNote) return;

    try {
      setSaveStatus("saving");

      onUpdateNoteContent(JSON.stringify(content));

      setSaveStatus("success");

      setTimeout(() => {
        setSaveStatus(currentStatus =>
          currentStatus === "success" ? "idle" : currentStatus
        );
      }, 2000);
    } catch (error) {
      console.error("Failed to save note content", error);
      setSaveStatus("error");
    }
  }, 3000);

  // Update handler for editor content changes
  useEffect(() => {
    if (!editor || !selectedNote) return;

    const updateListener = ({ editor }: { editor: Editor }) => {
      setSaveStatus("unsaved");
      debouncedSave(editor.getJSON());
    };

    editor.on("update", updateListener);

    return () => {
      editor.off("update", updateListener);
    };
  }, [editor, selectedNote, debouncedSave]);

  const getCurrentContent = () => {
    if (!editor) return null;
    return JSON.stringify(editor.getJSON());
  };

  const contextValue = {
    editor,
    saveStatus,
    getCurrentContent
  };

  return (
    <EditorContext.Provider value={contextValue}>
      {children}
    </EditorContext.Provider>
  );
}
