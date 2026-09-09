import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { apartmentsApi, filesApi } from "@/api/endpoints";
import { AppShell } from "@/components/app/AppShell";
import { EmptyState, ErrorState, useApiMessage } from "@/components/app/ApiState";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n";
import { formatDate } from "@/lib/format";
import { documentSchema, firstIssue } from "@/lib/validation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "الوثائق | Immeuble 29 — Documents" },
      { name: "description", content: "Documents officiels de l'immeuble 29 : devis, factures, comptes rendus et règlements." },
      { property: "og:title", content: "Immeuble 29 — Documents" },
      { property: "og:description", content: "Documents partagés avec les résidents, téléchargement sécurisé." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <DocumentsPage />
    </AppShell>
  ),
});

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const CATEGORIES = ["invoice", "quote", "minutes", "regulation", "other"];

function DocumentsPage() {
  const { t, locale } = useI18n();
  const { isManager } = useAuth();
  const queryClient = useQueryClient();
  const apiMessage = useApiMessage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("other");
  const [visibility, setVisibility] = useState("all_residents");
  const [apartmentId, setApartmentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const docs = useQuery({ queryKey: ["documents"], queryFn: filesApi.list });
  const apartments = useQuery({ queryKey: ["apartments"], queryFn: apartmentsApi.list, enabled: isManager });

  const upload = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error(t("file"));
      const parsed = documentSchema.safeParse({
        title: title.trim() || file.name,
        category,
        visibility,
        apartment_id: apartmentId ? Number(apartmentId) : undefined,
      });
      if (!parsed.success) throw new Error(`${t("err_validation")} (${firstIssue(parsed)})`);
      const form = new FormData();
      form.append("file", file);
      form.append("title", parsed.data.title);
      form.append("category", parsed.data.category ?? "");
      form.append("visibility", parsed.data.visibility);
      if (parsed.data.apartment_id) form.append("apartment_id", String(parsed.data.apartment_id));
      return filesApi.upload(form);
    },
    onSuccess: async () => {
      setError(null);
      setFeedback(t("saved"));
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (err: unknown) => {
      setFeedback(null);
      setError(apiMessage(err));
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => filesApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
    onError: (err: unknown) => setError(apiMessage(err)),
  });

  const [downloadError, setDownloadError] = useState<string | null>(null);
  const download = async (id: number, name: string) => {
    setDownloadError(null);
    try {
      await filesApi.download(id, name);
    } catch (err) {
      setDownloadError(apiMessage(err));
    }
  };

  const visibilityLabel = (value: string) =>
    value === "manager" ? t("vis_manager") : value === "apartment" ? t("vis_apartment") : t("vis_all");

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold">{t("documents")}</h1>

      {isManager && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("upload")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="title">{t("title")}</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="file">{t("file")}</Label>
                <Input id="file" type="file" ref={fileRef} accept="image/jpeg,image/png,image/webp,application/pdf" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("doc_category")}</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c === "other" ? t("cat_other") : c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("visibility")}</Label>
                <Select
                  value={visibility}
                  onValueChange={(value) => {
                    setVisibility(value);
                    if (value !== "apartment") setApartmentId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_residents">{t("vis_all")}</SelectItem>
                    <SelectItem value="manager">{t("vis_manager")}</SelectItem>
                    <SelectItem value="apartment">{t("vis_apartment")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {visibility === "apartment" && (
                <div className="space-y-1.5">
                  <Label>{t("apartment")}</Label>
                  <Select value={apartmentId} onValueChange={setApartmentId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(apartments.data ?? []).map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.number} — {a.primary_name ?? ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <p className="text-muted-foreground text-xs">{t("max_size_note")}</p>
            {error && <p className="text-destructive text-sm">{error}</p>}
            {feedback && <p className="text-sm text-emerald-600">{feedback}</p>}
            <Button disabled={upload.isPending} onClick={() => upload.mutate()}>
              <Upload className="size-4" />
              {upload.isPending ? t("uploading") : t("upload")}
            </Button>
          </CardContent>
        </Card>
      )}

      {docs.isPending && <p className="text-muted-foreground text-sm">{t("loading")}</p>}
      {docs.isError && <ErrorState error={docs.error} onRetry={() => void docs.refetch()} />}
      {docs.data?.length === 0 && <EmptyState label={t("no_documents")} />}
      {downloadError && <p className="text-destructive text-sm">{downloadError}</p>}

      <div className="space-y-2">
        {(docs.data ?? []).map((doc) => (
          <Card key={doc.id}>
            <CardContent className="flex flex-wrap items-center gap-3 py-3">
              <FileText className="text-primary size-4" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{doc.title}</p>
                <p className="text-muted-foreground text-xs">
                  {sizeLabel(doc.size_bytes)} · {formatDate(doc.created_at, locale)} · {doc.uploaded_by ?? "—"}
                  {doc.category ? ` · ${doc.category}` : ""}
                </p>
              </div>
              <Badge variant={doc.visibility === "manager" ? "secondary" : "outline"}>
                {visibilityLabel(doc.visibility)}
                {doc.visibility === "apartment" && doc.apartment_number ? ` ${doc.apartment_number}` : ""}
              </Badge>
              <Button size="sm" variant="outline" onClick={() => void download(doc.id, doc.original_name)}>
                <Download className="size-4" />
                {t("download")}
              </Button>
              {isManager && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" disabled={remove.isPending} aria-label={t("delete")}>
                      <Trash2 className="size-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("delete")}</AlertDialogTitle>
                      <AlertDialogDescription>{t("confirm_delete_doc")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove.mutate(doc.id)}>{t("delete")}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
