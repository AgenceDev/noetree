"use client";

import { Button } from "../ui/button";
import { Link as LinkIcon, Image as ImageIcon, Check } from "lucide-react";
import { Separator } from "../ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { ToolbarGroup } from "./ToolbarGroup";
import {
  formattingItems,
  headingItems,
  historyItems,
  listItems,
  specialItems,
} from "./toolbarItems";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useState } from "react";
import { useEditorContext } from "@/providers/EditorProvider";

export default function EditorToolbar() {
  const { editor } = useEditorContext();
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");

  const openLinkDialog = () => {
    if (!editor) return;

    // If there's already a link selected, get its attributes
    if (editor.isActive("link")) {
      const attrs = editor.getAttributes("link");
      setLinkUrl(attrs.href || "");
      setLinkText(
        editor.state.selection.content().content.firstChild?.text || "",
      );
    } else {
      setLinkUrl("");
      setLinkText(
        editor.state.selection.content().content.firstChild?.text || "",
      );
    }

    setLinkDialogOpen(true);
  };

  const insertLink = () => {
    if (!editor) return;

    // If URL is empty, remove the link
    if (!linkUrl) {
      editor.chain().focus().unsetLink().run();
      setLinkDialogOpen(false);
      return;
    }

    // If text is selected, update it with link text if provided
    if (linkText) {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: linkUrl })
        .insertContent(linkText)
        .run();
    } else {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: linkUrl })
        .run();
    }

    setLinkDialogOpen(false);
  };

  const openImageDialog = () => {
    setImageUrl("");
    setImageAlt("");
    setImageDialogOpen(true);
  };

  const insertImage = () => {
    if (!editor || !imageUrl) return;

    editor
      .chain()
      .focus()
      .setImage({
        src: imageUrl,
        alt: imageAlt || "Image",
      })
      .run();

    setImageDialogOpen(false);
  };

  return (
    <TooltipProvider delayDuration={1000}>
      <div className="flex flex-wrap gap-1">
        <ToolbarGroup items={historyItems} />

        <Separator orientation="vertical" className="h-auto!" />

        <ToolbarGroup items={headingItems} />

        <Separator orientation="vertical" className="h-auto!" />

        <ToolbarGroup items={formattingItems} />

        <Separator orientation="vertical" className="h-auto!" />

        <ToolbarGroup items={listItems} />

        <Separator orientation="vertical" className="h-auto!" />

        {/* Special elements group */}
        <ToolbarGroup items={specialItems} />

        <Separator orientation="vertical" className="h-auto!" />

        {/* Extra features */}
        <ToolbarButton
          onClick={openLinkDialog}
          active={editor?.isActive("link")}
          tooltip="Insert Link (Ctrl+K)"
          icon={<LinkIcon className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={openImageDialog}
          tooltip="Insert Image"
          icon={<ImageIcon className="h-4 w-4" />}
        />

        {/* Link Dialog */}
        <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Insert Link</DialogTitle>
              <DialogDescription>
                Enter the URL and optional link text
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="url">URL</Label>
                <Input
                  id="url"
                  placeholder="https://example.com"
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="linkText">Link Text</Label>
                <Input
                  id="linkText"
                  placeholder="Optional text to display"
                  value={linkText}
                  onChange={e => setLinkText(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setLinkDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" onClick={insertLink} className="gap-1">
                <Check className="h-4 w-4" />
                Insert Link
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Image Dialog */}
        <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Insert Image</DialogTitle>
              <DialogDescription>
                Enter the image URL and optional alt text
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="imageUrl">Image URL</Label>
                <Input
                  id="imageUrl"
                  placeholder="https://example.com/image.jpg"
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="imageAlt">Alt Text</Label>
                <Input
                  id="imageAlt"
                  placeholder="Image description for accessibility"
                  value={imageAlt}
                  onChange={e => setImageAlt(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setImageDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" onClick={insertImage} className="gap-1">
                <Check className="h-4 w-4" />
                Insert Image
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

EditorToolbar.displayName = "EditorToolbar";

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  tooltip: string;
  icon: React.ReactNode;
}

const ToolbarButton = ({
  onClick,
  active,
  disabled,
  tooltip,
  icon,
}: ToolbarButtonProps) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        type="button"
        size="icon"
        variant={active ? "secondary" : "ghost"}
        onClick={onClick}
        disabled={disabled}
        className="h-8 w-8"
      >
        {icon}
      </Button>
    </TooltipTrigger>
    <TooltipContent side="bottom">{tooltip}</TooltipContent>
  </Tooltip>
);
