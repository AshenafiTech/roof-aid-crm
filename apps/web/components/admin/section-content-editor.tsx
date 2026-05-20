"use client";

// Small per-section content editor. Each Section card mounts one of
// these for its body. TipTap keeps its own undo/redo and renders the
// variable chips, but the surface is intentionally narrower than the
// full-document editor: paragraphs, bullets, ordered lists, and three
// inline marks. No tables / images at this layer — sections are short.

import { useEffect, useMemo, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Underline as UnderlineIcon,
  Variable,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

import type { Block } from "@/lib/templates/blocks";
import { blocksToTipTap, tipTapToBlocks } from "@/lib/templates/tiptap";
import { tokensFor } from "@/lib/templates/tokens";
import type { TemplateKind } from "@/lib/templates/template-kinds";

import { VariableMention } from "./tiptap-variable-extension";

interface Props {
  kind: TemplateKind;
  initialContent: Block[];
  onChange: (blocks: Block[]) => void;
  editable?: boolean;
}

export function SectionContentEditor({
  kind,
  initialContent,
  onChange,
  editable = true,
}: Props) {
  // Build the initial PM JSON from the blocks. We compute on first
  // render only — subsequent edits flow through onChange + the parent's
  // state, not back into the editor.
  const initialJson = useMemo(
    () => blocksToTipTap({ blocks: initialContent }),
    [initialContent],
  );

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, // Section's own title is the heading
      }),
      Underline,
      Placeholder.configure({
        placeholder: "Write the section body. Use Insert variable for {{placeholders}}.",
      }),
      VariableMention,
    ],
    content: initialJson,
    editable,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[120px] px-4 py-3 focus:outline-none",
      },
    },
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const { blocks } = tipTapToBlocks(
        editor.getJSON() as Parameters<typeof tipTapToBlocks>[0],
      );
      onChangeRef.current(blocks);
    },
  });

  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editor, editable]);

  const tokens = tokensFor(kind);

  return (
    <div className="rounded-md border bg-white text-zinc-900 dark:bg-zinc-50 dark:text-zinc-900">
      {editable && editor && (
        <div className="flex flex-wrap items-center gap-1 border-b bg-zinc-50 px-2 py-1">
          <ToolBtn
            title="Bold"
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
          >
            <Bold className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn
            title="Italic"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
          >
            <Italic className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn
            title="Underline"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive("underline")}
          >
            <UnderlineIcon className="h-4 w-4" />
          </ToolBtn>
          <Divider />
          <ToolBtn
            title="Bullet list"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")}
          >
            <List className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn
            title="Numbered list"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")}
          >
            <ListOrdered className="h-4 w-4" />
          </ToolBtn>
          <Divider />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2">
                <Variable className="h-3.5 w-3.5" />
                Variable
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-h-[280px] overflow-y-auto"
            >
              {tokens.map((t) => (
                <DropdownMenuItem
                  key={t.token}
                  onClick={() =>
                    editor
                      .chain()
                      .focus()
                      .insertContent({ type: "mention", attrs: { id: t.token } })
                      .run()
                  }
                >
                  <span className="font-mono text-xs">{`{{${t.token}}}`}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t.label}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolBtn({
  children,
  title,
  active,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      className={
        "inline-flex h-7 w-7 items-center justify-center rounded hover:bg-zinc-200 " +
        (active ? "bg-zinc-200" : "")
      }
      {...rest}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-4 w-px bg-zinc-300" />;
}
