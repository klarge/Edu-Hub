import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db/schema";

interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
  appName: string;
  reminderDaysBefore: number;
  remindersEnabled: boolean;
}

export async function getMailConfig(): Promise<SmtpConfig> {
  const rows = await db.select().from(appSettingsTable);
  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;
  return {
    host: s["smtp_host"] ?? "",
    port: parseInt(s["smtp_port"] ?? "587"),
    user: s["smtp_user"] || undefined,
    pass: s["smtp_password"] || undefined,
    from: s["smtp_from"] || s["smtp_user"] || "no-reply@trainhub.local",
    appName: s["app_name"] || "TrainHub",
    reminderDaysBefore: parseInt(s["reminder_days_before"] ?? "3"),
    remindersEnabled: s["reminders_enabled"] !== "false",
  };
}

async function buildTransport(cfg: SmtpConfig) {
  if (!cfg.host) return null;
  const { createTransport } = await import("nodemailer");
  return createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
}

export async function sendTrainingAssigned(opts: {
  to: string;
  firstName: string;
  trainingTitle: string;
  dueDate?: Date | null;
  appName?: string;
}): Promise<void> {
  const cfg = await getMailConfig();
  const transport = await buildTransport(cfg);
  if (!transport) return;

  const name = opts.appName ?? cfg.appName;
  const due = opts.dueDate ? ` — due by ${opts.dueDate.toLocaleDateString()}` : "";

  await transport.sendMail({
    from: cfg.from,
    to: opts.to,
    subject: `[${name}] New training assigned: ${opts.trainingTitle}`,
    text: [
      `Hi ${opts.firstName},`,
      ``,
      `You have been assigned a new training on ${name}:`,
      `  ${opts.trainingTitle}${due}`,
      ``,
      `Log in to ${name} to start your training.`,
      ``,
      `— ${name}`,
    ].join("\n"),
    html: `<p>Hi ${opts.firstName},</p>
<p>You have been assigned a new training on <strong>${name}</strong>:</p>
<blockquote><strong>${opts.trainingTitle}</strong>${due}</blockquote>
<p>Log in to ${name} to start your training.</p>
<p>— ${name}</p>`,
  });
}

export async function sendEventRegistrationConfirmation(opts: {
  to: string;
  firstName: string;
  eventTitle: string;
  location?: string | null;
  startAt: Date;
  appName?: string;
}): Promise<void> {
  const cfg = await getMailConfig();
  const transport = await buildTransport(cfg);
  if (!transport) return;

  const name = opts.appName ?? cfg.appName;
  const dateStr = opts.startAt.toLocaleString();
  const loc = opts.location ? `\nLocation: ${opts.location}` : "";

  await transport.sendMail({
    from: cfg.from,
    to: opts.to,
    subject: `[${name}] Registration confirmed: ${opts.eventTitle}`,
    text: [
      `Hi ${opts.firstName},`,
      ``,
      `You are registered for:`,
      `  ${opts.eventTitle}`,
      `  Date: ${dateStr}${loc}`,
      ``,
      `We look forward to seeing you there!`,
      ``,
      `— ${name}`,
    ].join("\n"),
    html: `<p>Hi ${opts.firstName},</p>
<p>You are registered for:</p>
<blockquote>
  <strong>${opts.eventTitle}</strong><br/>
  Date: ${dateStr}${opts.location ? `<br/>Location: ${opts.location}` : ""}
</blockquote>
<p>We look forward to seeing you there!</p>
<p>— ${name}</p>`,
  });
}

export async function sendDueDateReminder(opts: {
  to: string;
  firstName: string;
  trainingTitle: string;
  dueDate: Date;
  appName?: string;
}): Promise<void> {
  const cfg = await getMailConfig();
  const transport = await buildTransport(cfg);
  if (!transport) return;

  const name = opts.appName ?? cfg.appName;
  const due = opts.dueDate.toLocaleDateString();

  await transport.sendMail({
    from: cfg.from,
    to: opts.to,
    subject: `[${name}] Reminder: "${opts.trainingTitle}" due ${due}`,
    text: [
      `Hi ${opts.firstName},`,
      ``,
      `This is a reminder that the following training is due on ${due}:`,
      `  ${opts.trainingTitle}`,
      ``,
      `Please log in to ${name} to complete it before the deadline.`,
      ``,
      `— ${name}`,
    ].join("\n"),
    html: `<p>Hi ${opts.firstName},</p>
<p>This is a reminder that the following training is due on <strong>${due}</strong>:</p>
<blockquote><strong>${opts.trainingTitle}</strong></blockquote>
<p>Please log in to ${name} to complete it before the deadline.</p>
<p>— ${name}</p>`,
  });
}
