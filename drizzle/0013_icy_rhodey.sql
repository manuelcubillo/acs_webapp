CREATE TABLE "member_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "tenant_role" NOT NULL,
	"token" text NOT NULL,
	"invited_by_user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "member_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "tenant_members" ADD COLUMN "removed_at" timestamp;--> statement-breakpoint
ALTER TABLE "member_invitations" ADD CONSTRAINT "member_invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_invitations" ADD CONSTRAINT "member_invitations_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_invitations_tenant_id_idx" ON "member_invitations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "member_invitations_email_idx" ON "member_invitations" USING btree ("email");