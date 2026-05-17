import { useState } from "react";
import { format } from "date-fns";
import {
  useGetEvent,
  useRegisterForEvent,
  useSubmitAttendanceCode,
  getGetEventQueryKey,
  getGetUserCompletionsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { ArrowLeft, MapPin, Calendar, Clock, Users } from "lucide-react";

export default function EventDetailPage({ id }: { id: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [attendanceCode, setAttendanceCode] = useState("");

  const { data, isLoading } = useGetEvent(id, {
    query: { enabled: !!id, queryKey: getGetEventQueryKey(id) },
  });
  const register = useRegisterForEvent();
  const submitCode = useSubmitAttendanceCode();

  const event = data?.event;
  const registrations = data?.registrations ?? [];
  const isRegistered = registrations.some((r) => r.userId === user?.id);

  function handleRegister() {
    register.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Registered successfully" });
          queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(id) });
        },
        onError: (err: unknown) => {
          const msg = (err as { data?: { error?: string } })?.data?.error ?? "Failed to register";
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      }
    );
  }

  function handleSubmitCode() {
    if (!attendanceCode.trim()) return;
    submitCode.mutate(
      { id, data: { code: attendanceCode.trim() } },
      {
        onSuccess: () => {
          toast({ title: "Attendance recorded", description: "Your attendance has been marked." });
          setAttendanceCode("");
          queryClient.invalidateQueries({ queryKey: getGetUserCompletionsQueryKey(user?.id ?? "") });
        },
        onError: (err: unknown) => {
          const msg = (err as { data?: { error?: string } })?.data?.error ?? "Invalid code";
          toast({ title: "Invalid code", description: msg, variant: "destructive" });
        },
      }
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-2xl">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!event) return <p className="text-sm text-muted-foreground">Event not found.</p>;

  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  const isPast = end < new Date();

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard">
          <a className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </a>
        </Link>
        <div>
          <h1 className="text-xl font-semibold">{event.title}</h1>
          {isPast && <Badge variant="secondary" className="mt-1">Past Event</Badge>}
        </div>
      </div>

      {/* Details card */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-start gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Date</p>
              <p className="text-muted-foreground">{format(start, "MMMM d, yyyy")}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Clock className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Time</p>
              <p className="text-muted-foreground">
                {format(start, "h:mm a")} – {format(end, "h:mm a")}
              </p>
            </div>
          </div>
          {event.location && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Location</p>
                <p className="text-muted-foreground">{event.location}</p>
              </div>
            </div>
          )}
          {event.maxCapacity && (
            <div className="flex items-start gap-2">
              <Users className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Capacity</p>
                <p className="text-muted-foreground">{event.maxCapacity} seats</p>
              </div>
            </div>
          )}
        </div>

        {event.description && (
          <div className="pt-2 border-t border-border">
            <p className="text-sm text-muted-foreground">{event.description}</p>
          </div>
        )}
      </div>

      {/* Registration */}
      {!isPast && (
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold mb-3">Registration</h2>
          {isRegistered ? (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              You are registered for this event
            </div>
          ) : (
            <Button
              data-testid="button-register-event"
              onClick={handleRegister}
              disabled={register.isPending}
            >
              {register.isPending ? "Registering..." : "Register for this event"}
            </Button>
          )}
        </div>
      )}

      {/* Attendance Code */}
      {isRegistered && (
        <div className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold mb-1">Attendance Check-in</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Enter the attendance code provided at the event
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="Enter attendance code"
              value={attendanceCode}
              onChange={(e) => setAttendanceCode(e.target.value)}
              data-testid="input-attendance-code"
              className="max-w-xs"
            />
            <Button
              data-testid="button-submit-attendance-code"
              onClick={handleSubmitCode}
              disabled={!attendanceCode.trim() || submitCode.isPending}
            >
              {submitCode.isPending ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
