"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { AppIcon } from "@/components/AppCard";
import { FormAlert, toFormErrors, type FieldErrors } from "@/components/form";
import { FormIcon } from "@/components/store/art";
import { PRESS } from "@/components/store/parts";
import { Field } from "@/components/ui/Field";
import { SelectField } from "@/components/ui/Select";
import { TextareaField } from "@/components/ui/Textarea";
import { TextLink } from "@/components/ui/TextLink";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiFetch } from "@/lib/api/client";
import {
  BINARY_EXTENSIONS,
  CATEGORIES,
  ICON_CONTENT_TYPES,
  MAX_DESCRIPTION_LENGTH,
  MAX_TAGLINE_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_VERSION_LENGTH,
  type AppDetail,
  type Category,
  type CreateAppBody,
  type PublicApp,
  type UpdateAppBody,
  type UploadKind,
} from "@/lib/api/types";
import {
  validateAppText,
  validateBinary,
  validateIcon,
  type AppText,
  type AppTextField,
} from "@/lib/app-validation";
import { cx } from "@/lib/cx";
import { withNext } from "@/lib/safe-next";
import { uploadFile } from "@/lib/upload";
import { EMPTY_SLOT, FileField, type UploadSlot } from "./FileField";
import { LaunchPath } from "./LaunchPath";
import { StorePreview } from "./StorePreview";

// In page order, so focus goes to the first invalid control.
const FIELDS = [
  "title",
  "tagline",
  "description",
  "category",
  "version",
  "binaryKey",
  "iconKey",
] as const;
type AppField = (typeof FIELDS)[number];
const TEXT_FIELDS: readonly AppTextField[] = [
  "title",
  "tagline",
  "description",
  "category",
  "version",
];
const KINDS: readonly UploadKind[] = ["binary", "icon"];
/** Each upload's field in the API's error details. */
const KEY_FIELD = { binary: "binaryKey", icon: "iconKey" } as const;
/** What /uploads' validation details can name; each is about the file. */
const UPLOAD_FIELDS = ["filename", "size", "contentType"] as const;

const ICON_TYPES = "PNG, WebP or JPEG, up to 1 MB";
const BINARY_TYPES = ".zip, .dmg, .apk, .exe, .msi, .pkg, .deb or .AppImage, up to 500 MB";

type AlertLink = "sign-in" | "dashboard" | null;

/** An upload that produced no key: its message for the file's field, or for the alert. */
interface UploadFailure {
  field?: string[];
  alert?: string;
  signIn?: boolean;
}

/** Line breaks as a textarea reports them (\n), so stored text compares with typed text. */
function normalize(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

// The store's pill buttons. Ink on brand is 7.8:1, and 5.6:1 on the green-600 hover.
const SUBMIT = cx(
  "focus-ring inline-flex h-12 w-full items-center justify-center rounded-full bg-brand px-6 text-base font-semibold text-ink hover:bg-green-600",
  "disabled:cursor-not-allowed disabled:opacity-60",
  PRESS,
);
const CANCEL = cx(
  "focus-ring inline-flex h-11 w-full items-center justify-center rounded-full px-6 font-semibold text-ink hover:bg-slate-100",
  PRESS,
);

/**
 * One step of the form, on the storefront's white card. Its number turns into a check, popping in,
 * once the step is complete.
 */
function Step({
  n,
  done,
  title,
  note,
  className,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  note: string;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cx("min-w-0 rounded-3xl bg-surface p-5 shadow-card sm:p-7", className)}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cx(
            "flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
            "transition-colors duration-(--duration-fast) ease-out",
            done ? "bg-brand text-ink" : "bg-green-100 text-green-800",
          )}
        >
          <span
            key={String(done)}
            className={cx(
              "flex transition-[opacity,scale] duration-(--duration-spring) ease-(--ease-spring)",
              "starting:opacity-0 motion-safe:starting:scale-50",
            )}
          >
            {done ? <FormIcon name="check" className="size-4.5" /> : n}
          </span>
        </span>
        <div className="min-w-0">
          <h2 id={id} className="text-xl font-semibold text-ink">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">{note}</p>
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** The fields whose trimmed value differs from the app's. */
function changedText(app: AppDetail, text: AppText): UpdateAppBody {
  const changes: Partial<Record<AppTextField, string>> = {};
  for (const field of TEXT_FIELDS) {
    const value = normalize(text[field].trim());
    if (value !== normalize(app[field])) changes[field] = value;
  }
  // Validated: a category that changed is one of CATEGORIES.
  return changes as UpdateAppBody;
}

/**
 * Publish an app, or edit one (`app`). Every field is checked before anything uploads, so a
 * rejected file never reaches /uploads. Then the binary and icon upload straight to storage in
 * parallel, each with its own progress, and only once both have keys does the POST or PATCH go.
 * A file that uploaded keeps its key, so a retry of the other file or a refused save never sends
 * it twice; a key the backend refuses is dropped, so the next submit uploads that file again. An
 * edit sends only what changed.
 */
export function AppForm({ app }: { app?: AppDetail }) {
  const router = useRouter();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  const [text, setText] = useState<AppText>({
    title: app?.title ?? "",
    tagline: app?.tagline ?? "",
    description: app?.description ?? "",
    category: app?.category ?? "",
    version: app?.version ?? "",
  });
  const [slots, setSlots] = useState<Record<UploadKind, UploadSlot>>({
    binary: EMPTY_SLOT,
    icon: EMPTY_SLOT,
  });
  const [errors, setErrors] = useState<FieldErrors<AppField>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [alertLink, setAlertLink] = useState<AlertLink>(null);
  const [pending, setPending] = useState<"upload" | "save" | null>(null);
  // Saved, while the dashboard loads: the path finishes and the listing goes live meanwhile.
  const [published, setPublished] = useState(false);
  // `pending` lands a render later; this blocks a second submit or retry fired before it does.
  const inFlight = useRef(false);

  // Leaving the page (Cancel, a link, Back) stops uploads in flight and frees the previews.
  const controller = useRef<AbortController | null>(null);
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    const urls = previews.current;
    return () => {
      abort.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const self = app ? `/dashboard/apps/${app.id}/edit` : "/dashboard/apps/new";
  const verb = app ? "save" : "publish";
  const left = () => controller.current?.signal.aborted ?? false;

  function patchSlot(kind: UploadKind, patch: Partial<UploadSlot>) {
    setSlots((all) => ({ ...all, [kind]: { ...all[kind], ...patch } }));
  }

  /** The backend refused this key (or can't trust it): the next submit uploads the file again. */
  function dropKey(kind: UploadKind) {
    patchSlot(kind, { key: null, status: "idle", progress: 0 });
  }

  function edit(field: AppTextField, value: string) {
    setText((all) => ({ ...all, [field]: value }));
    setErrors((all) => ({ ...all, [field]: undefined }));
  }

  /** Checks a chosen file at once. A different file starts over: any old key is dropped. */
  function choose(kind: UploadKind, file: File | null) {
    const error = file && (kind === "binary" ? validateBinary(file) : validateIcon(file));
    const old = slots[kind].preview;
    if (old) {
      URL.revokeObjectURL(old);
      previews.current.delete(old);
    }
    const preview = kind === "icon" && file && !error ? URL.createObjectURL(file) : null;
    if (preview) previews.current.add(preview);
    // The old key's object stays in storage: there's no cleanup endpoint.
    patchSlot(kind, { ...EMPTY_SLOT, file, preview });
    setErrors((all) => ({ ...all, [KEY_FIELD[kind]]: error ? [error] : undefined }));
  }

  /** Every field's problem: the backend's rules, so nothing it would refuse gets uploaded. */
  function validate(): FieldErrors<AppField> {
    const found: FieldErrors<AppField> = validateAppText(text);
    const { file: binary } = slots.binary;
    const binaryError = binary ? validateBinary(binary) : app ? null : "Choose your app's file.";
    if (binaryError) found.binaryKey = [binaryError];
    const iconError = slots.icon.file && validateIcon(slots.icon.file);
    if (iconError) found.iconKey = [iconError];
    return found;
  }

  /** Ends the attempt: shows what failed, and focuses the first invalid control or the alert. */
  function show(found: FieldErrors<AppField>, formMessage: string | null, link: AlertLink = null) {
    inFlight.current = false;
    // Commit first (the fieldset too), so the control is enabled and described when focus lands.
    flushSync(() => {
      setPending(null);
      setErrors(found);
      setMessage(formMessage);
      setAlertLink(link);
    });
    const first = FIELDS.find((field) => found[field]?.length);
    const name = first === "binaryKey" ? "binary" : first === "iconKey" ? "icon" : first;
    const target = name
      ? formRef.current?.querySelector<HTMLElement>(`[name="${name}"]`)
      : formMessage && alertRef.current;
    if (target) target.focus();
  }

  /** Uploads one file, tracking its progress. Resolves with its key, or with what went wrong. */
  async function upload(kind: UploadKind, file: File): Promise<string | UploadFailure> {
    patchSlot(kind, { key: null, status: "uploading", progress: 0 });
    try {
      const key = await uploadFile(kind, file, {
        signal: controller.current?.signal,
        onProgress: (progress) => patchSlot(kind, { progress }),
      });
      patchSlot(kind, { key, status: "done", progress: 1 });
      return key;
    } catch (err) {
      patchSlot(kind, { status: "failed" });
      // The PUT failed (UploadError) or was cancelled: the row's Failed and Retry say it.
      if (!(err instanceof ApiError)) return {};
      if (err.status === 401 || err.status === 429) {
        return { alert: err.message, signIn: err.status === 401 };
      }
      const mapped = toFormErrors(err, UPLOAD_FIELDS);
      const field = Object.values(mapped.errors).flatMap((messages) => messages ?? []);
      return { field: field.length > 0 ? field : [mapped.message ?? err.message] };
    }
  }

  /** Each failed file's message on its field (keeping `kept`), the rest in the alert. */
  function showUploadFailures(
    failures: [UploadKind, UploadFailure][],
    kept: FieldErrors<AppField> = {},
  ) {
    const found = { ...kept };
    let alert: string | null = null;
    let signIn = false;
    for (const [kind, failure] of failures) {
      if (failure.field) found[KEY_FIELD[kind]] = failure.field;
      if (failure.alert) alert = failure.alert;
      if (failure.signIn) signIn = true;
      if (!failure.field && !failure.alert) {
        alert ??= `The upload didn’t finish. Retry it, or ${verb} again.`;
      }
    }
    show(found, alert, signIn ? "sign-in" : null);
  }

  /** The POST or PATCH failed. A key the backend refused is dropped, so it uploads again. */
  function fail(err: unknown) {
    if (err instanceof ApiError) {
      if (err.status === 401) return show({}, err.message, "sign-in");
      if (err.status === 404 && app) return show({}, err.message, "dashboard");
      if (err.status === 403) {
        // "That upload belongs to another account.": neither key can be trusted.
        KINDS.forEach(dropKey);
        return show({}, err.message);
      }
    }
    const mapped = toFormErrors(err, FIELDS);
    // "Upload not found." (400) or "Already used by another app." (409).
    for (const kind of KINDS) if (mapped.errors[KEY_FIELD[kind]]) dropKey(kind);
    show(mapped.errors, mapped.message);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const found = validate();
    if (FIELDS.some((field) => found[field]?.length)) return show(found, null);
    const changes = app ? changedText(app, text) : {};
    if (app && Object.keys(changes).length === 0 && !slots.binary.file && !slots.icon.file) {
      return show({}, "No changes to save.");
    }

    inFlight.current = true;
    setErrors({});
    setMessage(null);
    setAlertLink(null);

    // Only files without a key yet, in parallel, and the save waits for all of them.
    const todo = KINDS.filter((kind) => slots[kind].file && !slots[kind].key);
    setPending(todo.length > 0 ? "upload" : "save");
    const results = await Promise.all(todo.map((kind) => upload(kind, slots[kind].file!)));
    if (left()) return;
    const keys: Partial<Record<UploadKind, string>> = {
      binary: slots.binary.key ?? undefined,
      icon: slots.icon.key ?? undefined,
    };
    const failures: [UploadKind, UploadFailure][] = [];
    results.forEach((result, i) => {
      if (typeof result === "string") keys[todo[i]] = result;
      else failures.push([todo[i], result]);
    });
    if (failures.length > 0) return showUploadFailures(failures);

    setPending("save");
    const files = {
      ...(keys.binary && { binaryKey: keys.binary }),
      ...(keys.icon && { iconKey: keys.icon }),
    };
    try {
      if (app) {
        const body: UpdateAppBody = { ...changes, ...files };
        await apiFetch<PublicApp>(`/api/apps/${app.id}`, { method: "PATCH", body });
      } else {
        const body: CreateAppBody = {
          title: text.title.trim(),
          tagline: text.tagline.trim(),
          description: text.description.trim(),
          category: text.category as Category,
          version: text.version.trim(),
          // validate() required a binary, and every upload has a key by now.
          binaryKey: keys.binary!,
          ...files,
        };
        await apiFetch<PublicApp>("/api/apps", { method: "POST", body });
      }
    } catch (err) {
      if (!left()) fail(err);
      return;
    }
    // The form stays locked until the dashboard replaces it.
    setPublished(true);
    toast.show(app ? "Changes saved." : "App published.", "success");
    if (!left()) router.push("/dashboard");
  }

  /** Uploads one failed file again, through a new upload URL (they expire). */
  async function retry(kind: UploadKind) {
    const { file } = slots[kind];
    if (inFlight.current || !file) return;
    inFlight.current = true;
    const kept = { ...errors, [KEY_FIELD[kind]]: undefined };
    setErrors(kept);
    setMessage(null);
    setAlertLink(null);
    setPending("upload");
    const result = await upload(kind, file);
    if (left()) return;
    if (typeof result !== "string") return showUploadFailures([[kind, result]], kept);
    inFlight.current = false;
    flushSync(() => setPending(null));
    // Retry is gone; submitting is the next step.
    submitRef.current?.focus();
  }

  // What's in place, for the steps' checks and the launch path. An edit keeps the files it has.
  const detailsReady = Object.keys(validateAppText(text)).length === 0;
  const binaryReady = slots.binary.file ? !validateBinary(slots.binary.file) : Boolean(app);
  const iconReady = slots.icon.file ? !validateIcon(slots.icon.file) : Boolean(app?.icon_url);
  const filesReady = binaryReady && (!slots.icon.file || iconReady);
  // The app as the store will show it: the chosen icon, the current one, or the title's letter.
  const listing = (size: "sm" | "lg") => (
    <AppIcon
      app={{
        id: app?.id ?? 0,
        title: text.title.trim() || "Your app",
        icon_url: slots.icon.preview ?? app?.icon_url ?? null,
      }}
      size={size}
    />
  );

  const busy = pending !== null;
  const submitLabel = published
    ? app
      ? "Saved"
      : "Published!"
    : pending === "upload"
      ? "Uploading…"
      : pending === "save"
        ? app
          ? "Saving…"
          : "Publishing…"
        : app
          ? "Save changes"
          : "Publish app";

  return (
    <form ref={formRef} method="post" noValidate onSubmit={submit} className="mt-6 sm:mt-8">
      <FormAlert ref={alertRef} message={message} />
      {alertLink === "sign-in" && (
        <p className="-mt-3 mb-5 text-sm">
          <TextLink href={withNext("/sign-in", self)}>Sign in again</TextLink> to {verb} your app.
        </p>
      )}
      {alertLink === "dashboard" && (
        <p className="-mt-3 mb-5 text-sm">
          <TextLink href="/dashboard">Back to your dashboard</TextLink>
        </p>
      )}

      {/* Locked while anything is in flight. min-w-0: a fieldset is otherwise min-content wide.
          Wide screens put the steps in a column beside the preview, which follows the scroll;
          narrow ones stack it between the files and the publish, in source order. */}
      <fieldset
        disabled={busy}
        className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8"
      >
        <Step
          n={1}
          done={detailsReady}
          title="About your app"
          note="What people see on your store page."
          className="lg:col-start-1"
        >
          <div className="flex flex-col gap-5">
            <Field
              label="Title"
              name="title"
              value={text.title}
              onChange={(event) => edit("title", event.currentTarget.value)}
              maxLength={MAX_TITLE_LENGTH}
              autoComplete="off"
              errors={errors.title}
            />
            <Field
              label="Tagline"
              name="tagline"
              value={text.tagline}
              onChange={(event) => edit("tagline", event.currentTarget.value)}
              maxLength={MAX_TAGLINE_LENGTH}
              autoComplete="off"
              hint="One line on what it does"
              errors={errors.tagline}
            />
            <TextareaField
              label="Description"
              name="description"
              value={text.description}
              onChange={(event) => edit("description", event.currentTarget.value)}
              maxLength={MAX_DESCRIPTION_LENGTH}
              rows={6}
              hint="Up to 5,000 characters"
              errors={errors.description}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField
                label="Category"
                name="category"
                value={text.category}
                onChange={(event) => edit("category", event.currentTarget.value)}
                errors={errors.category}
              >
                {!app && (
                  <option value="" disabled>
                    Choose a category
                  </option>
                )}
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </SelectField>
              <Field
                label="Version"
                name="version"
                value={text.version}
                onChange={(event) => edit("version", event.currentTarget.value)}
                maxLength={MAX_VERSION_LENGTH}
                autoComplete="off"
                spellCheck={false}
                hint="Like 1.2 or 2.0.1-beta.1"
                errors={errors.version}
              />
            </div>
          </div>
        </Step>

        <Step
          n={2}
          done={filesReady}
          title="Your files"
          note={
            app
              ? "Replace either one, or keep what’s there."
              : "The file people download, and an icon for the store."
          }
          className="lg:col-start-1"
        >
          <div className="flex flex-col gap-6">
            <FileField
              name="binary"
              label={app ? "Replace binary" : "Binary"}
              prompt={app ? "Drop a new build here" : "Drop your build here"}
              accept={BINARY_EXTENSIONS.join(",")}
              hint={
                app
                  ? `Optional: leave it empty to keep the current file. ${BINARY_TYPES}.`
                  : `The file people download: ${BINARY_TYPES}.`
              }
              progressLabel="Binary upload"
              slot={slots.binary}
              errors={errors.binaryKey}
              onChoose={(file) => choose("binary", file)}
              onRetry={() => retry("binary")}
            />
            <FileField
              name="icon"
              image
              current={app && <AppIcon app={app} size="md" />}
              label={app ? "Replace icon" : "Icon"}
              prompt={app ? "Drop a new icon here" : "Drop a square icon here"}
              accept={ICON_CONTENT_TYPES.join(",")}
              hint={
                app
                  ? `Optional: a square ${ICON_TYPES}. An icon can be replaced, not removed.`
                  : `Optional: a square ${ICON_TYPES}.`
              }
              progressLabel="Icon upload"
              slot={slots.icon}
              errors={errors.iconKey}
              onChoose={(file) => choose("icon", file)}
              onRetry={() => retry("icon")}
            />
          </div>
        </Step>

        <div className="lg:sticky lg:top-24 lg:col-start-2 lg:row-span-3 lg:row-start-1">
          <StorePreview
            text={text}
            icon={listing("lg")}
            iconKey={slots.icon.preview ?? app?.icon_url ?? "letter"}
          />
        </div>

        <Step
          n={3}
          done={published}
          title={app ? "Save your changes" : "Plant it on Sprout"}
          note={
            app
              ? "New files upload first, then your changes go live."
              : "Your files go straight to storage, then your app is listed."
          }
          className="lg:col-start-1"
        >
          <LaunchPath
            slots={slots}
            ready={{ details: detailsReady, binary: binaryReady, icon: iconReady }}
            stage={published ? "published" : pending}
            editing={Boolean(app)}
            listing={listing("sm")}
          />
          <div className="mt-6 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <button ref={submitRef} type="submit" className={SUBMIT}>
              {submitLabel}
            </button>
            <Link href="/dashboard" className={CANCEL}>
              Cancel
            </Link>
          </div>
        </Step>
      </fieldset>
    </form>
  );
}
