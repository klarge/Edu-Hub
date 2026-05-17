import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListTrainings,
  useCreateTraining,
  useUpdateTraining,
  useDeleteTraining,
  useGetTraining,
  useGetQuiz,
  useCreateQuiz,
  useUpdateQuiz,
  useDeleteQuiz,
  useCreateQuizQuestion,
  useUpdateQuizQuestion,
  useDeleteQuizQuestion,
  useAddTrainingContent,
  useUploadScorm,
  useUploadPptx,
  useDeleteTrainingContent,
  getListTrainingsQueryKey,
  getGetTrainingQueryKey,
  getGetQuizQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  GraduationCap,
  Plus,
  Search,
  Pencil,
  Trash2,
  Upload,
  Link as LinkIcon,
  BookOpen,
  HelpCircle,
} from "lucide-react";
import type { Training, TrainingContent, QuizQuestion } from "@workspace/api-client-react";

// --- Training Form ---
const trainingSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  estimatedDurationMinutes: z.coerce.number().optional(),
});
type TrainingForm = z.infer<typeof trainingSchema>;

// --- Quiz Form ---
const quizSchema = z.object({
  title: z.string().min(1, "Title is required"),
  passingScore: z.coerce.number().min(1).max(100),
});
type QuizForm = z.infer<typeof quizSchema>;

// --- Question Form ---
const questionSchema = z.object({
  question: z.string().min(1, "Question text is required"),
  option0: z.string().min(1, "Option A required"),
  option1: z.string().min(1, "Option B required"),
  option2: z.string().optional(),
  option3: z.string().optional(),
  correctAnswerIndex: z.coerce.number().min(0).max(3),
  displayOrder: z.coerce.number().optional(),
});
type QuestionForm = z.infer<typeof questionSchema>;

// --- Content URL Form ---
const contentUrlSchema = z.object({
  type: z.enum(["youtube", "slides"]),
  url: z.string().url("Must be a valid URL"),
  title: z.string().optional(),
});
type ContentUrlForm = z.infer<typeof contentUrlSchema>;

function QuizEditor({ trainingId }: { trainingId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showQuizForm, setShowQuizForm] = useState(false);
  const [showQForm, setShowQForm] = useState(false);
  const [editingQ, setEditingQ] = useState<QuizQuestion | null>(null);
  const [deleteQId, setDeleteQId] = useState<string | null>(null);

  const { data: quizData, isLoading } = useGetQuiz(trainingId, {
    query: { enabled: !!trainingId, queryKey: getGetQuizQueryKey(trainingId) },
  });
  const createQuiz = useCreateQuiz();
  const updateQuiz = useUpdateQuiz();
  const deleteQuiz = useDeleteQuiz();
  const createQ = useCreateQuizQuestion();
  const updateQ = useUpdateQuizQuestion();
  const deleteQ = useDeleteQuizQuestion();

  const quiz = quizData?.quiz;
  const questions = quizData?.questions ?? [];

  const quizForm = useForm<QuizForm>({
    resolver: zodResolver(quizSchema),
    defaultValues: { title: quiz?.title ?? "", passingScore: quiz?.passingScore ?? 70 },
  });
  const qForm = useForm<QuestionForm>({
    resolver: zodResolver(questionSchema),
    defaultValues: { question: "", option0: "", option1: "", option2: "", option3: "", correctAnswerIndex: 0, displayOrder: 0 },
  });

  function invalidateQuiz() {
    queryClient.invalidateQueries({ queryKey: getGetQuizQueryKey(trainingId) });
  }

  function onSaveQuiz(values: QuizForm) {
    if (quiz) {
      updateQuiz.mutate(
        { id: trainingId, data: { title: values.title, passingScore: values.passingScore } },
        { onSuccess: () => { toast({ title: "Quiz updated" }); invalidateQuiz(); setShowQuizForm(false); } }
      );
    } else {
      createQuiz.mutate(
        { id: trainingId, data: { title: values.title, passingScore: values.passingScore } },
        { onSuccess: () => { toast({ title: "Quiz created" }); invalidateQuiz(); setShowQuizForm(false); } }
      );
    }
  }

  function onSaveQuestion(values: QuestionForm) {
    const options = [values.option0, values.option1];
    if (values.option2) options.push(values.option2);
    if (values.option3) options.push(values.option3);
    const payload = {
      question: values.question,
      options,
      correctAnswerIndex: values.correctAnswerIndex,
      displayOrder: values.displayOrder ?? questions.length,
    };
    if (editingQ) {
      updateQ.mutate(
        { id: trainingId, questionId: editingQ.id, data: payload },
        {
          onSuccess: () => { toast({ title: "Question updated" }); invalidateQuiz(); setShowQForm(false); setEditingQ(null); },
          onError: () => toast({ title: "Failed to update question", variant: "destructive" }),
        }
      );
    } else {
      createQ.mutate(
        { id: trainingId, data: payload },
        {
          onSuccess: () => { toast({ title: "Question added" }); invalidateQuiz(); setShowQForm(false); qForm.reset(); },
          onError: () => toast({ title: "Failed to add question", variant: "destructive" }),
        }
      );
    }
  }

  function openEditQ(q: QuizQuestion) {
    setEditingQ(q);
    qForm.reset({
      question: q.question,
      option0: q.options[0] ?? "",
      option1: q.options[1] ?? "",
      option2: q.options[2] ?? "",
      option3: q.options[3] ?? "",
      correctAnswerIndex: q.correctAnswerIndex ?? 0,
      displayOrder: q.displayOrder,
    });
    setShowQForm(true);
  }

  if (isLoading) return <Skeleton className="h-20 w-full" />;

  return (
    <div className="space-y-4">
      {!quiz ? (
        <div className="bg-muted rounded-lg p-6 text-center">
          <HelpCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">No quiz yet</p>
          <p className="text-xs text-muted-foreground mb-3">Add a quiz to test learner knowledge</p>
          <Button size="sm" onClick={() => setShowQuizForm(true)} data-testid="button-create-quiz">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Create Quiz
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg border border-border">
            <div>
              <p className="text-sm font-medium">{quiz.title}</p>
              <p className="text-xs text-muted-foreground">Passing score: {quiz.passingScore}%</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => { quizForm.reset({ title: quiz.title, passingScore: quiz.passingScore }); setShowQuizForm(true); }} data-testid="button-edit-quiz">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => deleteQuiz.mutate({ id: trainingId }, { onSuccess: () => { toast({ title: "Quiz deleted" }); invalidateQuiz(); } })}
                data-testid="button-delete-quiz"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Questions ({questions.length})</p>
            <Button size="sm" variant="outline" onClick={() => { setEditingQ(null); qForm.reset(); setShowQForm(true); }} data-testid="button-add-question">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Question
            </Button>
          </div>

          <div className="space-y-2">
            {questions.map((q, idx) => (
              <div key={q.id} data-testid={`row-question-${q.id}`} className="flex items-start justify-between p-3 bg-card border border-border rounded-lg">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{idx + 1}. {q.question}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {q.options.map((opt, oi) => (
                      <span key={oi} className={`text-xs px-1.5 py-0.5 rounded ${oi === (q.correctAnswerIndex ?? -1) ? "bg-emerald-100 text-emerald-700 font-medium" : "bg-muted text-muted-foreground"}`}>
                        {opt}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1 ml-2">
                  <Button size="sm" variant="ghost" onClick={() => openEditQ(q)} data-testid={`button-edit-question-${q.id}`}><Pencil className="h-3 w-3" /></Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => setDeleteQId(q.id)}
                    data-testid={`button-delete-question-${q.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quiz title/passing score dialog */}
      <Dialog open={showQuizForm} onOpenChange={setShowQuizForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{quiz ? "Edit Quiz" : "Create Quiz"}</DialogTitle></DialogHeader>
          <form onSubmit={quizForm.handleSubmit(onSaveQuiz)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input {...quizForm.register("title")} data-testid="input-quiz-title" />
            </div>
            <div className="space-y-1.5">
              <Label>Passing Score (%)</Label>
              <Input type="number" {...quizForm.register("passingScore")} data-testid="input-quiz-passing-score" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowQuizForm(false)}>Cancel</Button>
              <Button type="submit" disabled={createQuiz.isPending || updateQuiz.isPending} data-testid="button-save-quiz">Save</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Question dialog */}
      <Dialog open={showQForm} onOpenChange={(o) => { setShowQForm(o); if (!o) setEditingQ(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingQ ? "Edit Question" : "Add Question"}</DialogTitle></DialogHeader>
          <form onSubmit={qForm.handleSubmit(onSaveQuestion)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Question</Label>
              <Input {...qForm.register("question")} data-testid="input-question-text" />
            </div>
            {["A", "B", "C", "D"].map((letter, i) => (
              <div key={i} className="space-y-1.5">
                <Label>Option {letter}{i < 2 ? " *" : ""}</Label>
                <Input {...qForm.register(`option${i}` as "option0")} data-testid={`input-option-${i}`} />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>Correct Answer (0 = A, 1 = B…)</Label>
              <Input type="number" min={0} max={3} {...qForm.register("correctAnswerIndex")} data-testid="input-correct-answer" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setShowQForm(false); setEditingQ(null); }}>Cancel</Button>
              <Button type="submit" disabled={createQ.isPending || updateQ.isPending} data-testid="button-save-question">Save</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete question confirm */}
      <AlertDialog open={!!deleteQId} onOpenChange={(o) => { if (!o) setDeleteQId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete question?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteQId) {
                  deleteQ.mutate(
                    { id: trainingId, questionId: deleteQId },
                    { onSuccess: () => { toast({ title: "Question deleted" }); invalidateQuiz(); setDeleteQId(null); } }
                  );
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ContentEditor({ trainingId }: { trainingId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showUrlForm, setShowUrlForm] = useState(false);
  const [deleteContentId, setDeleteContentId] = useState<string | null>(null);

  const { data, isLoading } = useGetTraining(trainingId, {
    query: { enabled: !!trainingId, queryKey: getGetTrainingQueryKey(trainingId) },
  });
  const addContent = useAddTrainingContent();
  const uploadScorm = useUploadScorm();
  const uploadPptx = useUploadPptx();
  const deleteContent = useDeleteTrainingContent();

  const contentList = data?.content ?? [];

  const urlForm = useForm<ContentUrlForm>({
    resolver: zodResolver(contentUrlSchema),
    defaultValues: { type: "youtube", url: "", title: "" },
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getGetTrainingQueryKey(trainingId) });
  }

  function onAddUrl(values: ContentUrlForm) {
    addContent.mutate(
      { id: trainingId, data: { type: values.type, url: values.url, title: values.title || undefined } },
      {
        onSuccess: () => { toast({ title: "Content added" }); invalidate(); setShowUrlForm(false); urlForm.reset(); },
        onError: () => toast({ title: "Failed to add content", variant: "destructive" }),
      }
    );
  }

  function handleScormUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("scorm", file);
    uploadScorm.mutate(
      { id: trainingId, data: fd },
      {
        onSuccess: () => { toast({ title: "SCORM uploaded" }); invalidate(); },
        onError: () => toast({ title: "Upload failed", variant: "destructive" }),
      }
    );
    e.target.value = "";
  }

  function handlePptxUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("pptx", file);
    uploadPptx.mutate(
      { id: trainingId, data: fd },
      {
        onSuccess: () => { toast({ title: "PPTX uploaded" }); invalidate(); },
        onError: () => toast({ title: "Upload failed", variant: "destructive" }),
      }
    );
    e.target.value = "";
  }

  const typeLabels: Record<string, string> = { scorm: "SCORM", youtube: "YouTube", slides: "Slides", pptx: "PPTX" };

  if (isLoading) return <Skeleton className="h-20 w-full" />;

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setShowUrlForm(true)} data-testid="button-add-url-content">
          <LinkIcon className="h-3.5 w-3.5 mr-1" />
          Add URL
        </Button>
        <label className="cursor-pointer">
          <Button size="sm" variant="outline" asChild data-testid="button-upload-scorm">
            <span>
              <Upload className="h-3.5 w-3.5 mr-1" />
              Upload SCORM
            </span>
          </Button>
          <input type="file" accept=".zip" className="hidden" onChange={handleScormUpload} />
        </label>
        <label className="cursor-pointer">
          <Button size="sm" variant="outline" asChild data-testid="button-upload-pptx">
            <span>
              <Upload className="h-3.5 w-3.5 mr-1" />
              Upload PPTX
            </span>
          </Button>
          <input type="file" accept=".pptx,.ppt" className="hidden" onChange={handlePptxUpload} />
        </label>
      </div>

      {contentList.length === 0 ? (
        <div className="bg-muted rounded-lg p-6 text-center">
          <BookOpen className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">No content yet</p>
          <p className="text-xs text-muted-foreground">Add a YouTube video, Google Slides URL, SCORM package, or PPTX file</p>
        </div>
      ) : (
        <div className="space-y-2">
          {contentList.map((c: TrainingContent) => (
            <div key={c.id} data-testid={`row-content-${c.id}`} className="flex items-center justify-between p-3 bg-card border border-border rounded-lg">
              <div>
                <p className="text-sm font-medium">{c.title ?? typeLabels[c.type] ?? c.type}</p>
                {c.url && <p className="text-xs text-muted-foreground truncate max-w-xs">{c.url}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">{typeLabels[c.type] ?? c.type}</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setDeleteContentId(c.id)}
                  data-testid={`button-delete-content-${c.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add URL dialog */}
      <Dialog open={showUrlForm} onOpenChange={setShowUrlForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Content URL</DialogTitle></DialogHeader>
          <form onSubmit={urlForm.handleSubmit(onAddUrl)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <select
                {...urlForm.register("type")}
                data-testid="select-content-type"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="youtube">YouTube Video</option>
                <option value="slides">Google Slides</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>URL</Label>
              <Input {...urlForm.register("url")} data-testid="input-content-url" placeholder="https://" />
              {urlForm.formState.errors.url && (
                <p className="text-xs text-destructive">{urlForm.formState.errors.url.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Title (optional)</Label>
              <Input {...urlForm.register("title")} data-testid="input-content-title" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowUrlForm(false)}>Cancel</Button>
              <Button type="submit" disabled={addContent.isPending} data-testid="button-save-url-content">Add</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete content confirm */}
      <AlertDialog open={!!deleteContentId} onOpenChange={(o) => { if (!o) setDeleteContentId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove content?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this content item.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteContentId) {
                  deleteContent.mutate(
                    { id: trainingId, contentId: deleteContentId },
                    {
                      onSuccess: () => { toast({ title: "Content removed" }); invalidate(); setDeleteContentId(null); },
                    }
                  );
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// --- Main Page ---
export default function ManageTrainingsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Training | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingContentId, setEditingContentId] = useState<string | null>(null);

  const { data, isLoading } = useListTrainings({ limit: 200 });
  const createTraining = useCreateTraining();
  const updateTraining = useUpdateTraining();
  const deleteTraining = useDeleteTraining();

  const form = useForm<TrainingForm>({
    resolver: zodResolver(trainingSchema),
    defaultValues: { title: "", description: "", estimatedDurationMinutes: undefined },
  });

  const trainings = (data?.trainings ?? []).filter(
    (t) => t.title.toLowerCase().includes(search.toLowerCase())
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListTrainingsQueryKey() });
  }

  function openCreate() {
    setEditing(null);
    form.reset({ title: "", description: "", estimatedDurationMinutes: undefined });
    setShowForm(true);
  }

  function openEdit(t: Training) {
    setEditing(t);
    form.reset({
      title: t.title,
      description: t.description ?? "",
      estimatedDurationMinutes: t.estimatedDurationMinutes ?? undefined,
    });
    setShowForm(true);
  }

  function onSave(values: TrainingForm) {
    const payload = {
      title: values.title,
      description: values.description || undefined,
      estimatedDurationMinutes: values.estimatedDurationMinutes || undefined,
    };
    if (editing) {
      updateTraining.mutate(
        { id: editing.id, data: payload },
        {
          onSuccess: () => { toast({ title: "Training updated" }); invalidate(); setShowForm(false); },
          onError: () => toast({ title: "Failed to update", variant: "destructive" }),
        }
      );
    } else {
      createTraining.mutate(
        { data: payload },
        {
          onSuccess: () => { toast({ title: "Training created" }); invalidate(); setShowForm(false); },
          onError: () => toast({ title: "Failed to create", variant: "destructive" }),
        }
      );
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-muted-foreground" />
            Manage Trainings
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Create and manage online training courses</p>
        </div>
        <Button onClick={openCreate} data-testid="button-new-training">
          <Plus className="h-4 w-4 mr-1.5" />
          New Training
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search trainings..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
          data-testid="input-search-trainings"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : trainings.length === 0 ? (
        <div className="bg-muted rounded-lg p-12 text-center">
          <GraduationCap className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">{search ? "No trainings match your search" : "No trainings yet"}</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Title</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Duration</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {trainings.map((t) => (
                <tr key={t.id} data-testid={`row-training-${t.id}`} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{t.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {t.estimatedDurationMinutes ? `${t.estimatedDurationMinutes} min` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={t.isActive ? "default" : "secondary"} className="text-xs">
                      {t.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingContentId(t.id)}
                        data-testid={`button-manage-content-${t.id}`}
                      >
                        <BookOpen className="h-3.5 w-3.5 mr-1" />
                        Content
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(t)} data-testid={`button-edit-training-${t.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setDeleteId(t.id)}
                        data-testid={`button-delete-training-${t.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Training" : "New Training"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input {...form.register("title")} data-testid="input-training-title" />
              {form.formState.errors.title && (
                <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input {...form.register("description")} data-testid="input-training-description" />
            </div>
            <div className="space-y-1.5">
              <Label>Estimated Duration (minutes)</Label>
              <Input type="number" {...form.register("estimatedDurationMinutes")} data-testid="input-training-duration" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={createTraining.isPending || updateTraining.isPending} data-testid="button-save-training">
                {editing ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Content/Quiz management dialog */}
      <Dialog open={!!editingContentId} onOpenChange={(o) => { if (!o) setEditingContentId(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Training Content</DialogTitle>
          </DialogHeader>
          {editingContentId && (
            <Tabs defaultValue="content">
              <TabsList className="mb-4">
                <TabsTrigger value="content">Content</TabsTrigger>
                <TabsTrigger value="quiz">Quiz</TabsTrigger>
              </TabsList>
              <TabsContent value="content">
                <ContentEditor trainingId={editingContentId} />
              </TabsContent>
              <TabsContent value="quiz">
                <QuizEditor trainingId={editingContentId} />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete training?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the training and all associated content. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) {
                  deleteTraining.mutate(
                    { id: deleteId },
                    {
                      onSuccess: () => { toast({ title: "Training deleted" }); invalidate(); setDeleteId(null); },
                      onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
                    }
                  );
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
