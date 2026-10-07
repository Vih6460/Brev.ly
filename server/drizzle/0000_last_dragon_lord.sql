CREATE TABLE "links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_url" text NOT NULL,
	"short_code" text NOT NULL,
	"access_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "links_access_count_nonnegative" CHECK ("links"."access_count" >= 0),
	CONSTRAINT "links_short_code_valid" CHECK ("links"."short_code" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("links"."short_code") <= 60)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "links_short_code_unique" ON "links" USING btree ("short_code");--> statement-breakpoint
CREATE INDEX "links_created_at_id_idx" ON "links" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);