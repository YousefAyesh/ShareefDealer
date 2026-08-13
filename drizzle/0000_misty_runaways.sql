CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"message" text,
	"source_page" text,
	"utm" jsonb,
	"ip" text,
	"user_agent" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"vehicles_seen" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"marked_sold" integer DEFAULT 0 NOT NULL,
	"photos_processed" integer DEFAULT 0 NOT NULL,
	"abort_reason" text,
	"raw_snapshot_ref" text,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"content_hash" text NOT NULL,
	"source_url" text NOT NULL,
	"url_thumb" text NOT NULL,
	"url_card" text NOT NULL,
	"url_full" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"alt" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_key" text NOT NULL,
	"source_key_type" text NOT NULL,
	"vin" text,
	"stock_number" text,
	"slug" text NOT NULL,
	"year" integer,
	"make" text,
	"model" text,
	"trim" text,
	"body_style" text,
	"drivetrain" text,
	"transmission" text,
	"engine" text,
	"fuel_type" text,
	"doors" integer,
	"exterior_color" text,
	"interior_color" text,
	"mileage" integer,
	"price_cents" integer,
	"down_payment_cents" integer,
	"weekly_payment_cents" integer,
	"description" text,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"price_reduced" boolean DEFAULT false NOT NULL,
	"source_hash" text NOT NULL,
	"vin_decoded" jsonb,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sold_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_photos" ADD CONSTRAINT "vehicle_photos_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_photos_vehicle_hash_idx" ON "vehicle_photos" USING btree ("vehicle_id","content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_source_key_idx" ON "vehicles" USING btree ("source_key");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_slug_idx" ON "vehicles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "vehicles_status_idx" ON "vehicles" USING btree ("status");