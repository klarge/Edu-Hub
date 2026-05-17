import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetTraining,
  useGetQuiz,
  useSubmitQuiz,
  useMarkContentViewed,
  useScormComplete,
  getGetQuizQueryKey,
  getGetTrainingQueryKey,
  getGetUserCompletionsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Link } from "wouter";
import type { TrainingContent } from "@workspace/api-client-react";

function ContentViewer({ content, trainingId }: { content: TrainingContent; trainingId: string }) {
  const markViewed = useMarkContentViewed();
  const scormComplete = useScormComplete();

  function handleIframeLoad() {
    markViewed.mutate({ id: trainingId, contentId: content.id });
  }

  if (content.type === "youtube" && content.url) {
    const videoId = content.url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{11})/
    )?.[1];
    return (
      <div className="aspect-video w-full rounded-lg overflow-hidden border border-border">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          className="w-full h-full"
          allowFullScreen
          title={content.title ?? "YouTube video"}
          onLoad={handleIframeLoad}
        />
      </div>
    );
  }

  if (content.type === "slides" && content.url) {
    return (
      <div className="aspect-video w-full rounded-lg overflow-hidden border border-border">
        <iframe
          src={content.url}
          className="w-full h-full"
          title={content.title ?? "Slides"}
          onLoad={handleIframeLoad}
        />
      </div>
    );
  }

  if (content.type === "scorm" || content.type === "pptx") {
    return (
      <div className="aspect-video w-full rounded-lg overflow-hidden border border-border">
        <iframe
          src={`/api/uploads/${content.id}/index.html`}
          className="w-full h-full"
          title={content.title ?? "Content"}
          onLoad={handleIframeLoad}
          onError={() => {
            scormComplete.mutate({ id: trainingId, data: { contentId: content.id } });
          }}
        />
      </div>
    );
  }

  return (
    <div className="bg-muted rounded-lg p-6 text-sm text-muted-foreground text-center">
      Unsupported content type: {content.type}
    </div>
  );
}

export default function TrainingDetailPage({ id }: { id: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [quizResult, setQuizResult] = useState<{
    score: number; passed: boolean; passingScore: number;
  } | null>(null);

  const { data: trainingData, isLoading } = useGetTraining(id, {
    query: { enabled: !!id, queryKey: getGetTrainingQueryKey(id) },
  });
  const { data: quizData } = useGetQuiz(id, {
    query: { enabled: !!id, queryKey: getGetQuizQueryKey(id) },
  });
  const submitQuiz = useSubmitQuiz();

  const training = trainingData?.training;
  const content = trainingData?.content ?? [];
  const quiz = quizData?.quiz;
  const questions = quizData?.questions ?? [];

  function handleSubmitQuiz() {
    if (!quiz) return;
    const answersArray = questions.map((_, i) => answers[i] ?? 0);
    submitQuiz.mutate(
      { id, data: { answers: answersArray } },
      {
        onSuccess: (data) => {
          setSubmitted(true);
          setQuizResult({ score: data.score, passed: data.passed, passingScore: data.passingScore });
          queryClient.invalidateQueries({ queryKey: getGetUserCompletionsQueryKey(user?.id ?? "") });
          if (data.passed) {
            toast({ title: "Quiz passed!", description: `Score: ${data.score}%` });
          } else {
            toast({
              title: "Quiz not passed",
              description: `Score: ${data.score}% (need ${data.passingScore}%)`,
              variant: "destructive",
            });
          }
        },
        onError: () => toast({ title: "Failed to submit quiz", variant: "destructive" }),
      }
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!training) {
    return <p className="text-sm text-muted-foreground">Training not found.</p>;
  }

  const contentTypeLabels: Record<string, string> = {
    scorm: "SCORM",
    youtube: "Video",
    slides: "Slides",
    pptx: "Presentation",
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard">
          <a className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </a>
        </Link>
        <div>
          <h1 className="text-xl font-semibold">{training.title}</h1>
          {training.estimatedDurationMinutes && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Clock className="h-3 w-3" />
              {training.estimatedDurationMinutes} min
            </p>
          )}
        </div>
      </div>

      {training.description && (
        <p className="text-sm text-muted-foreground">{training.description}</p>
      )}

      {/* Content */}
      {content.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold">Course Content</h2>
          {content.map((c) => (
            <div key={c.id} className="space-y-2">
              <div className="flex items-center gap-2">
                {c.title && <p className="text-sm font-medium">{c.title}</p>}
                <Badge variant="secondary" className="text-xs">
                  {contentTypeLabels[c.type] ?? c.type}
                </Badge>
              </div>
              <ContentViewer content={c} trainingId={id} />
            </div>
          ))}
        </div>
      )}

      {content.length === 0 && (
        <div className="bg-muted rounded-lg p-8 text-center text-sm text-muted-foreground">
          No content has been added to this training yet.
        </div>
      )}

      {/* Quiz */}
      {quiz && questions.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold">{quiz.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Passing score: {quiz.passingScore}%
            </p>
          </div>

          {submitted && quizResult && (
            <div
              className={`flex items-center gap-2 p-3 rounded-lg text-sm font-medium ${
                quizResult.passed
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {quizResult.passed ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              {quizResult.passed ? "Passed" : "Not passed"} — Score: {quizResult.score}%
              {!quizResult.passed &&
                ` (need ${quizResult.passingScore}%)`}
            </div>
          )}

          {!submitted && (
            <div className="space-y-6">
              {questions.map((q, idx) => (
                <div key={q.id} data-testid={`quiz-question-${idx}`}>
                  <p className="text-sm font-medium mb-3">
                    {idx + 1}. {q.question}
                  </p>
                  <RadioGroup
                    value={answers[idx]?.toString()}
                    onValueChange={(v) =>
                      setAnswers((prev) => ({ ...prev, [idx]: parseInt(v) }))
                    }
                    className="space-y-2"
                  >
                    {q.options.map((opt, optIdx) => (
                      <div key={optIdx} className="flex items-center gap-2">
                        <RadioGroupItem
                          value={optIdx.toString()}
                          id={`q${idx}-opt${optIdx}`}
                          data-testid={`radio-q${idx}-opt${optIdx}`}
                        />
                        <Label htmlFor={`q${idx}-opt${optIdx}`} className="text-sm cursor-pointer">
                          {opt}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              ))}

              <Button
                data-testid="button-submit-quiz"
                onClick={handleSubmitQuiz}
                disabled={
                  submitQuiz.isPending ||
                  Object.keys(answers).length < questions.length
                }
              >
                {submitQuiz.isPending ? "Submitting..." : "Submit Quiz"}
              </Button>
            </div>
          )}

          {submitted && !quizResult?.passed && (
            <Button
              variant="outline"
              onClick={() => {
                setSubmitted(false);
                setQuizResult(null);
                setAnswers({});
              }}
            >
              Retry Quiz
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
