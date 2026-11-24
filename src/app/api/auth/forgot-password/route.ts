import { NextRequest, NextResponse } from "next/server";
import { forgotPasswordSchema } from "@/schemas";
import { formatErrorMessage } from "@/lib/error-formatter";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = forgotPasswordSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
    if (!smtpConfigured) {
      return NextResponse.json(
        {
          success: false,
          emailSent: false,
          error:
            "Self-service email reset is not enabled on this server. Please contact your Organization Owner or Platform Super Admin to reset your password.",
        },
        { status: 501 }
      );
    }

    return NextResponse.json({
      success: true,
      emailSent: true,
      message:
        "If an account exists for this email, password reset instructions have been sent.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: formatErrorMessage(error, 500, "Could not process your password reset request.") },
      { status: 500 }
    );
  }
}
