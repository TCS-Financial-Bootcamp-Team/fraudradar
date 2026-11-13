"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { LocaleSwitcher } from "@/i18n/locale-switcher";
import { useValidationText } from "@/i18n/use-validation-text";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { useAuth } from "../hooks/use-auth";
import {
  signupSchema,
  loginSchema,
  resetRequestSchema,
  passwordUpdateSchema,
  type SignupInput,
  type LoginInput,
} from "../schemas/auth";

type AuthMode = "login" | "signup" | "reset" | "update";

function PasswordStrengthMeter({ password }: { password: string }) {
  const score =
    password.length === 0
      ? 0
      : [
          password.length >= 8,
          /[A-Z]/.test(password) && /[a-z]/.test(password),
          /\d/.test(password),
          /[^A-Za-z0-9]/.test(password),
        ].filter(Boolean).length;

  const t = useTranslations("auth.password.strength");
  const hints = [
    t("empty"),
    t("weak"),
    t("fair"),
    t("good"),
    t("strong"),
  ];

  return (
    <div className="flex flex-col gap-1 mt-1">
      <div
        className="grid grid-cols-4 gap-1"
        aria-hidden="true"
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-[3px] rounded-[2px] transition-colors ${
              i < score
                ? score <= 1
                  ? "bg-signal"
                  : "bg-primary"
                : "bg-track"
            }`}
          />
        ))}
      </div>
      <span id="pw-hint" className="text-xs text-muted-foreground">
        {hints[score]}
      </span>
    </div>
  );
}

function LoginForm() {
  const auth = useAuth();
  const t = useTranslations("auth");
  const text = useValidationText();
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [showPw, setShowPw] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  return (
    <form
      className="flex flex-col gap-5 w-full"
      onSubmit={handleSubmit((data) =>
        auth.signIn({ ...data, keepSignedIn })
      )}
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="m-0 text-[26px] font-semibold tracking-[-0.025em] text-foreground">
          {t("login.title")}
        </h2>
        <p className="m-0 text-sm text-muted-foreground">
          {t("login.subtitle")}
        </p>
      </div>

      <Field label={t("email")} error={errors.email?.message}>
        <Input
          type="email"
          autoComplete="username"
          placeholder={t("emailPlaceholder")}
          {...register("email")}
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-baseline">
          <label className="text-[13px] font-medium text-foreground">
            {t("password.label")}
          </label>
          <Link
            href="/reset-password"
            className="text-xs text-muted-foreground underline underline-offset-[3px] hover:text-foreground"
          >
            {t("login.forgot")}
          </Link>
        </div>
        <div className="relative flex">
          <Input
            type={showPw ? "text" : "password"}
            autoComplete="current-password"
            className="pr-16"
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPw(!showPw)}
            className="absolute right-1.5 top-1.5 h-8 px-2.5 border-0 rounded-md bg-transparent text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            {showPw ? t("password.hide") : t("password.show")}
          </button>
        </div>
        {errors.password?.message && (
          <span className="text-xs text-signal">
            {text(errors.password.message)}
          </span>
        )}
      </div>

      <label className="flex items-center gap-2.5 text-[13px] text-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={keepSignedIn}
          onChange={(e) => setKeepSignedIn(e.target.checked)}
          className="size-4 rounded border-border accent-primary"
        />
        {t("login.keepSignedIn")}
      </label>

      <Button type="submit" className="h-11 font-medium" disabled={auth.busy}>
        {auth.busy ? t("login.submitting") : t("login.submit")}
      </Button>

      <p className="m-0 pt-4 border-t border-border text-center text-[13px] text-muted-foreground">
        {t("login.noAccount")}{" "}
        <Link
          href="/signup"
          className="font-medium text-foreground underline underline-offset-[3px]"
        >
          {t("login.createAccount")}
        </Link>
      </p>
    </form>
  );
}

function SignupForm() {
  const auth = useAuth();
  const t = useTranslations("auth");
  const text = useValidationText();
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupInput>({ resolver: zodResolver(signupSchema) });

  if (auth.message) {
    return (
      <div role="status" className="notice">
        {auth.message}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4.5 w-full"
      onSubmit={handleSubmit(auth.signUp)}
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="m-0 text-[26px] font-semibold tracking-[-0.025em] text-foreground">
          {t("signup.title")}
        </h2>
        <p className="m-0 text-sm text-muted-foreground">
          {t("signup.subtitle")}
        </p>
      </div>

      <Field label={t("name")} error={errors.name?.message}>
        <Input
          type="text"
          autoComplete="name"
          placeholder={t("namePlaceholder")}
          {...register("name")}
        />
      </Field>

      <Field label={t("email")} error={errors.email?.message}>
        <Input
          type="email"
          autoComplete="email"
          placeholder={t("emailPlaceholder")}
          {...register("email")}
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-foreground">
          {t("password.label")}
        </label>
        <div className="relative flex">
          <Input
            type={showPw ? "text" : "password"}
            autoComplete="new-password"
            className="pr-16"
            aria-describedby="pw-hint"
            {...register("password", {
              onChange: (e) => setPassword(e.target.value),
            })}
          />
          <button
            type="button"
            onClick={() => setShowPw(!showPw)}
            className="absolute right-1.5 top-1.5 h-8 px-2.5 border-0 rounded-md bg-transparent text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            {showPw ? t("password.hide") : t("password.show")}
          </button>
        </div>
        <PasswordStrengthMeter password={password} />
        {errors.password?.message && (
          <span className="text-xs text-signal">
            {text(errors.password.message)}
          </span>
        )}
      </div>

      <Field label={t("password.confirm")} error={errors.confirmation?.message}>
        <Input
          type={showPw ? "text" : "password"}
          autoComplete="new-password"
          {...register("confirmation")}
        />
      </Field>

      <label className="flex items-start gap-2.5 text-[13px] text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          className="size-4 mt-0.5 rounded border-border accent-primary shrink-0"
        />
        <span>
          {t("signup.academic")}
        </span>
      </label>

      <Button type="submit" className="h-11 font-medium" disabled={auth.busy}>
        {auth.busy ? t("signup.submitting") : t("signup.submit")}
      </Button>

      <p className="m-0 pt-4 border-t border-border text-center text-[13px] text-muted-foreground">
        {t("signup.haveAccount")}{" "}
        <Link
          href="/login"
          className="font-medium text-foreground underline underline-offset-[3px]"
        >
          {t("signup.signIn")}
        </Link>
      </p>
    </form>
  );
}

function ResetPasswordForm() {
  const auth = useAuth();
  const t = useTranslations("auth");
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ email: string }>({
    resolver: zodResolver(resetRequestSchema),
  });

  if (auth.message) {
    return (
      <div className="flex flex-col gap-4 w-full">
        <div role="status" className="notice">
          {auth.message}
        </div>
        <Link
          href="/login"
          className="text-[13px] text-foreground underline underline-offset-[3px] text-center"
        >
          {t("reset.back")}
        </Link>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-5 w-full"
      onSubmit={handleSubmit(auth.requestPasswordReset)}
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="m-0 text-[26px] font-semibold tracking-[-0.025em] text-foreground">
          {t("reset.title")}
        </h2>
        <p className="m-0 text-sm text-muted-foreground">
          {t("reset.subtitle")}
        </p>
      </div>

      <Field label={t("reset.emailLabel")} error={errors.email?.message}>
        <Input
          type="email"
          autoComplete="email"
          placeholder={t("emailPlaceholder")}
          {...register("email")}
        />
      </Field>

      <Button type="submit" className="h-11 font-medium" disabled={auth.busy}>
        {auth.busy ? t("reset.submitting") : t("reset.submit")}
      </Button>

      <p className="m-0 pt-4 border-t border-border text-center text-[13px] text-muted-foreground">
        <Link
          href="/login"
          className="text-foreground underline underline-offset-[3px]"
        >
          {t("reset.back")}
        </Link>
      </p>
    </form>
  );
}

function UpdatePasswordForm() {
  const auth = useAuth();
  const t = useTranslations("auth");
  const text = useValidationText();
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ password: string; confirmation: string }>({
    resolver: zodResolver(passwordUpdateSchema),
  });

  return (
    <form
      className="flex flex-col gap-5 w-full"
      onSubmit={handleSubmit(auth.updatePassword)}
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="m-0 text-[26px] font-semibold tracking-[-0.025em] text-foreground">
          {t("update.title")}
        </h2>
        <p className="m-0 text-sm text-muted-foreground">
          {t("update.subtitle")}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-foreground">
          {t("password.newLabel")}
        </label>
        <div className="relative flex">
          <Input
            type={showPw ? "text" : "password"}
            autoComplete="new-password"
            className="pr-16"
            aria-describedby="pw-hint"
            {...register("password", {
              onChange: (e) => setPassword(e.target.value),
            })}
          />
          <button
            type="button"
            onClick={() => setShowPw(!showPw)}
            className="absolute right-1.5 top-1.5 h-8 px-2.5 border-0 rounded-md bg-transparent text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            {showPw ? t("password.hide") : t("password.show")}
          </button>
        </div>
        <PasswordStrengthMeter password={password} />
        {errors.password?.message && (
          <span className="text-xs text-signal">
            {text(errors.password.message)}
          </span>
        )}
      </div>

      <Field
        label={t("password.confirmNew")}
        error={errors.confirmation?.message}
      >
        <Input
          type={showPw ? "text" : "password"}
          autoComplete="new-password"
          {...register("confirmation")}
        />
      </Field>

      <Button type="submit" className="h-11 font-medium" disabled={auth.busy}>
        {auth.busy ? t("update.submitting") : t("update.submit")}
      </Button>

      <p className="m-0 pt-4 border-t border-border text-center text-[13px] text-muted-foreground">
        <Link
          href="/login"
          className="text-foreground underline underline-offset-[3px]"
        >
          {t("reset.back")}
        </Link>
      </p>
    </form>
  );
}

export function AuthScreen({
  mode,
  error,
}: {
  mode: AuthMode;
  error?: string;
}) {
  const t = useTranslations("auth");
  return (
    <div className="auth-layout font-sans">
      {/* Brand Panel: segue a cor da barra lateral e os tokens salvos */}
      <section aria-label={t("brand.region")} className="auth-brand">
        <div className="flex items-center gap-2.5 font-semibold text-base tracking-[-0.015em] text-sidebar-foreground">
          <svg
            width="22"
            height="22"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="10"
              cy="10"
              r="8.25"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M10 10 L10 1.75 A8.25 8.25 0 0 1 17.6 6.8 Z"
              fill="currentColor"
            />
            <circle cx="13.6" cy="12.4" r="1.6" className="fill-signal" />
          </svg>
          FraudRadar
        </div>

        <div className="flex flex-col gap-4 max-w-[460px]">
          {mode === "login" ? (
            <>
              <h1 className="m-0 text-[clamp(28px,3.2vw,40px)] font-semibold tracking-[-0.03em] leading-[1.1] text-sidebar-foreground">
                {t("brand.loginTitle")}
              </h1>
              <p className="m-0 text-[15px] text-sidebar-muted">
                {t("brand.loginBody")}
              </p>
            </>
          ) : mode === "signup" ? (
            <>
              <h1 className="m-0 text-[clamp(28px,3.2vw,40px)] font-semibold tracking-[-0.03em] leading-[1.1] text-sidebar-foreground">
                {t("brand.signupTitle")}
              </h1>
              <p className="m-0 text-[15px] text-sidebar-muted">
                {t("brand.signupBody")}
              </p>
            </>
          ) : (
            <>
              <h1 className="m-0 text-[clamp(28px,3.2vw,40px)] font-semibold tracking-[-0.03em] leading-[1.1] text-sidebar-foreground">
                {t("brand.resetTitle")}
              </h1>
              <p className="m-0 text-[15px] text-sidebar-muted">
                {t("brand.resetBody")}
              </p>
            </>
          )}
        </div>

        {mode === "login" ? (
          <dl className="m-0 grid grid-cols-3 gap-4 pt-5 border-t border-[var(--sidebar-divider)] tabular-nums">
            <div>
              <dt className="text-xs text-sidebar-muted">{t("brand.statTransactions")}</dt>
              <dd className="m-0 text-xl font-medium text-sidebar-foreground">
                {t("brand.statTransactionsValue")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-sidebar-muted">{t("brand.statWeeks")}</dt>
              <dd className="m-0 text-xl font-medium text-sidebar-foreground">
                14
              </dd>
            </div>
            <div>
              <dt className="text-xs text-sidebar-muted">{t("brand.statQueue")}</dt>
              <dd className="m-0 text-xl font-medium text-sidebar-foreground">
                300
              </dd>
            </div>
          </dl>
        ) : mode === "signup" ? (
          <ol className="m-0 p-0 list-none flex flex-col gap-2.5 pt-5 border-t border-[var(--sidebar-divider)] text-[13px] text-sidebar-foreground">
            <li className="flex gap-3">
              <span className="font-mono text-sidebar-muted">01</span>
              <span>{t("brand.signupStep1")}</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-sidebar-muted">02</span>
              <span>{t("brand.signupStep2")}</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-sidebar-muted">03</span>
              <span>{t("brand.signupStep3")}</span>
            </li>
          </ol>
        ) : (
          <ol className="m-0 p-0 list-none flex flex-col gap-2.5 pt-5 border-t border-[var(--sidebar-divider)] text-[13px] text-sidebar-foreground">
            <li className="flex gap-3">
              <span className="font-mono text-sidebar-muted">01</span>
              <span>{t("brand.resetStep1")}</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-sidebar-muted">02</span>
              <span>{t("brand.resetStep2")}</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-sidebar-muted">03</span>
              <span>{t("brand.resetStep3")}</span>
            </li>
          </ol>
        )}
      </section>

      {/* Form Section */}
      <main className="flex-1 flex items-center justify-center p-8 sm:p-12 lg:p-16 min-w-0">
        <div className="w-full max-w-[380px] flex flex-col gap-5">
          <LocaleSwitcher className="self-end" />
          {error && (
            <div role="alert" className="notice text-xs text-signal">
              {t("linkExpired")}
            </div>
          )}

          {!getSupabaseConfig() ? (
            <div role="status" className="notice">
              <strong className="mb-2 block">{t("configureTitle")}</strong>
              {t("supabaseConfig")}
            </div>
          ) : mode === "login" ? (
            <LoginForm />
          ) : mode === "signup" ? (
            <SignupForm />
          ) : mode === "reset" ? (
            <ResetPasswordForm />
          ) : (
            <UpdatePasswordForm />
          )}
        </div>
      </main>
    </div>
  );
}
