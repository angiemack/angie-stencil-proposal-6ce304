import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Image } from "@tiptap/extension-image";
import { Link } from "@tiptap/extension-link";
import { Markdown } from "tiptap-markdown";
import {
  Bold,
  Code,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  SquareCode,
  Strikethrough,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Separator } from "~/components/ui/separator";
import { Toggle } from "~/components/ui/toggle";
import { cn } from "~/lib/utils";

interface RichTextEditorProps {
  /** Markdown in, markdown out — never HTML. */
  value: string;
  onChange: (markdown: string) => void;
  /** Route accepting a multipart `file` POST and returning `{ url }`. */
  uploadUrl?: string;
  placeholder?: string;
  /** Tailwind min-height class for the writing surface. */
  minHeightClass?: string;
  /** Tailwind max-height class; content scrolls internally past it. */
  maxHeightClass?: string;
  /** Fired on Cmd/Ctrl+Enter so a composer can submit from the keyboard. */
  onSubmit?: () => void;
  /** File-picker `accept` filter. */
  accept?: string;
  className?: string;
}

type MarkdownStorage = { markdown: { getMarkdown: () => string } };

export function RichTextEditor({
  value,
  onChange,
  uploadUrl = "/api/upload",
  placeholder,
  minHeightClass = "min-h-32",
  maxHeightClass,
  onSubmit,
  accept = "image/*,.pdf,.txt,.md,.csv,.json",
  className,
}: RichTextEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // A ref so the handleKeyDown closure (created once with the editor) always
  // calls the latest onSubmit, which reads the parent's current draft state.
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const editor = useEditor({
    // The app server-renders; creating the editor before mount would mismatch hydration.
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Image.configure({ inline: true }),
      // openOnClick false: on an editing surface a click should place the cursor, not navigate.
      Link.configure({ openOnClick: false }),
      Markdown.configure({ transformPastedText: true, transformCopiedText: true }),
    ],
    content: value,
    editorProps: {
      attributes: {
        // Same prose overrides as the read side (~/components/markdown) so what
        // you type matches what renders back.
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none outline-none px-3 py-2",
          "prose-p:leading-relaxed prose-pre:bg-muted prose-pre:text-foreground",
          "prose-code:before:content-none prose-code:after:content-none",
          "prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-sm",
          minHeightClass,
        ),
      },
      handleKeyDown(_view, event) {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && onSubmitRef.current) {
          event.preventDefault();
          onSubmitRef.current();
          return true;
        }
        return false;
      },
    },
    onUpdate({ editor }) {
      onChangeRef.current((editor.storage as MarkdownStorage).markdown.getMarkdown());
    },
  });

  // Sync external value changes (e.g. clearing the draft after submit).
  const lastValueRef = useRef(value);
  useEffect(() => {
    if (!editor || value === lastValueRef.current) return;
    lastValueRef.current = value;
    if ((editor.storage as MarkdownStorage).markdown.getMarkdown() !== value) {
      editor.commands.setContent(value);
    }
  }, [editor, value]);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!editor) return;
      setUploadError(null);
      const fd = new FormData();
      fd.append("file", file);
      let res: Response;
      try {
        res = await fetch(uploadUrl, { method: "POST", body: fd });
      } catch {
        setUploadError("Upload failed — check your connection and try again.");
        return;
      }
      if (!res.ok) {
        setUploadError("Upload failed — try again.");
        return;
      }
      const { url } = (await res.json()) as { url: string };
      if (file.type.startsWith("image/")) {
        editor.chain().focus().setImage({ src: url }).run();
      } else {
        // A proper link-marked node (a raw markdown string wouldn't get the mark); the
        // trailing space exits the mark so text typed after isn't pulled into the link.
        editor
          .chain()
          .focus()
          .insertContent([
            { type: "text", text: file.name, marks: [{ type: "link", attrs: { href: url } }] },
            { type: "text", text: " " },
          ])
          .run();
      }
    },
    [editor, uploadUrl],
  );

  // Paste files (e.g. a screenshot from the clipboard).
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind !== "file") continue;
        e.preventDefault();
        const file = item.getAsFile();
        if (file) void uploadFile(file);
        break;
      }
    }
    dom.addEventListener("paste", onPaste);
    return () => dom.removeEventListener("paste", onPaste);
  }, [editor, uploadFile]);

  // Drop files onto the editor.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    function onDrop(e: DragEvent) {
      const files = e.dataTransfer?.files;
      if (!files?.length) return;
      e.preventDefault();
      void uploadFile(files[0]);
    }
    dom.addEventListener("drop", onDrop);
    return () => dom.removeEventListener("drop", onDrop);
  }, [editor, uploadFile]);

  if (!editor) return null;

  const applyLink = () => {
    const href = linkUrl.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (href) {
      chain.setLink({ href }).run();
    } else {
      chain.unsetLink().run();
    }
    setLinkOpen(false);
  };

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-input p-1">
        <Toggle
          size="sm"
          pressed={editor.isActive("bold")}
          onPressedChange={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
          aria-label="Bold"
        >
          <Bold />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive("italic")}
          onPressedChange={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
          aria-label="Italic"
        >
          <Italic />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive("strike")}
          onPressedChange={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
          aria-label="Strikethrough"
        >
          <Strikethrough />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive("code")}
          onPressedChange={() => editor.chain().focus().toggleCode().run()}
          title="Inline code"
          aria-label="Inline code"
        >
          <Code />
        </Toggle>
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        <Toggle
          size="sm"
          pressed={editor.isActive("bulletList")}
          onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet list"
          aria-label="Bullet list"
        >
          <List />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive("orderedList")}
          onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
          title="Ordered list"
          aria-label="Ordered list"
        >
          <ListOrdered />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive("codeBlock")}
          onPressedChange={() => editor.chain().focus().toggleCodeBlock().run()}
          title="Code block"
          aria-label="Code block"
        >
          <SquareCode />
        </Toggle>
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        <Popover
          open={linkOpen}
          onOpenChange={(open) => {
            setLinkOpen(open);
            if (open) setLinkUrl(editor.getAttributes("link").href ?? "");
          }}
        >
          <PopoverTrigger asChild>
            <Toggle size="sm" pressed={editor.isActive("link")} title="Link" aria-label="Link">
              <Link2 />
            </Toggle>
          </PopoverTrigger>
          <PopoverContent className="flex w-72 flex-row items-center gap-2 p-2" align="start">
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                }
              }}
            />
            <Button size="sm" onClick={applyLink}>
              {linkUrl.trim() ? "Apply" : "Remove"}
            </Button>
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => fileRef.current?.click()}
          title="Upload image or file"
          aria-label="Upload image or file"
        >
          <ImagePlus />
        </Button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept={accept}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadFile(f);
            e.target.value = "";
          }}
        />
      </div>

      <div className={cn("relative", maxHeightClass && `${maxHeightClass} overflow-y-auto`)}>
        {editor.isEmpty && placeholder && (
          <span className="pointer-events-none absolute top-2 left-3 text-sm text-muted-foreground select-none">
            {placeholder}
          </span>
        )}
        <EditorContent editor={editor} />
      </div>

      {uploadError && <p className="px-3 pb-2 text-sm text-destructive">{uploadError}</p>}
    </div>
  );
}
