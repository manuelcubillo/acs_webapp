CREATE TABLE "departure_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reason" text,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
