"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";

import { login } from "./actions";

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("next") ?? undefined;

  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  function onSubmit(values: LoginFormValues) {
    setServerError(null);
    startTransition(async () => {
      try {
        const result = await login(values.email, values.password, redirectTo);
        if (result?.error) {
          setServerError(result.error);
        }
      } catch (err) {
        setServerError(
          err instanceof Error
            ? err.message
            : "Unexpected error during sign-in.",
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {serverError && <div className="form-err">{serverError}</div>}

      <div className="form-group">
        <label className="form-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          disabled={isPending}
          placeholder="you@company.com"
          className={`form-input${errors.email ? " error" : ""}`}
          {...register("email")}
        />
        {errors.email && (
          <p className="field-err">{errors.email.message}</p>
        )}
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="password">
          Password
        </label>
        <div className="pw-wrap">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            disabled={isPending}
            placeholder="Enter your password"
            className={`form-input${errors.password ? " error" : ""}`}
            {...register("password")}
          />
          <button
            type="button"
            className="pw-toggle"
            onClick={() => setShowPassword((v) => !v)}
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {errors.password && (
          <p className="field-err">{errors.password.message}</p>
        )}
      </div>

      <button type="submit" className="btn-blue" disabled={isPending}>
        {isPending ? (
          <>
            <span className="spin" />
            Signing in...
          </>
        ) : (
          <>
            Sign in <span>→</span>
          </>
        )}
      </button>

      <div className="meta">
        <Link href="/" className="meta-text" style={{ color: "inherit" }}>
          ← Back to home
        </Link>
        <Link href="/signup" className="meta-link">
          Need an account?
        </Link>
      </div>
    </form>
  );
}
