CREATE TABLE `artwork` (
	`id` text PRIMARY KEY NOT NULL,
	`media_item_id` text NOT NULL,
	`kind` text NOT NULL,
	`local_path` text NOT NULL,
	`source_url` text,
	`source_page_url` text,
	`provider` text NOT NULL,
	`width` integer,
	`height` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`media_item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `artwork_media_item_kind_idx` ON `artwork` (`media_item_id`,`kind`);--> statement-breakpoint
CREATE TABLE `audio_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`media_file_id` text NOT NULL,
	`stream_index` integer NOT NULL,
	`language` text,
	`label` text NOT NULL,
	`codec` text NOT NULL,
	`channels` integer,
	`is_default` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`media_file_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `audio_tracks_file_stream_idx` ON `audio_tracks` (`media_file_id`,`stream_index`);--> statement-breakpoint
CREATE TABLE `credits` (
	`id` text PRIMARY KEY NOT NULL,
	`media_item_id` text NOT NULL,
	`person_id` text NOT NULL,
	`role` text NOT NULL,
	`character_name` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`media_item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `credits_media_item_idx` ON `credits` (`media_item_id`);--> statement-breakpoint
CREATE TABLE `episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`series_id` text NOT NULL,
	`season_id` text NOT NULL,
	`episode_number` integer NOT NULL,
	`absolute_number` integer,
	`title` text NOT NULL,
	`overview` text DEFAULT '' NOT NULL,
	`air_date` text,
	`runtime_ms` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_season_number_idx` ON `episodes` (`season_id`,`episode_number`);--> statement-breakpoint
CREATE TABLE `favorites` (
	`profile_id` text NOT NULL,
	`media_item_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`profile_id`, `media_item_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `genres` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `genres_name_unique` ON `genres` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `genres_slug_unique` ON `genres` (`slug`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`available_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`lease_owner` text,
	`lease_expires_at` integer,
	`error_json` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_claim_idx` ON `jobs` (`status`,`available_at`);--> statement-breakpoint
CREATE TABLE `library_roots` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`path` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`online` integer DEFAULT true NOT NULL,
	`last_scan_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `library_roots_path_kind_idx` ON `library_roots` (`path`,`kind`);--> statement-breakpoint
CREATE TABLE `media_files` (
	`id` text PRIMARY KEY NOT NULL,
	`library_root_id` text NOT NULL,
	`media_item_id` text,
	`episode_id` text,
	`relative_path` text NOT NULL,
	`fingerprint` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`modified_at_ms` integer NOT NULL,
	`container` text,
	`duration_ms` integer,
	`video_codec` text,
	`audio_codec` text,
	`width` integer,
	`height` integer,
	`hdr` text,
	`available` integer DEFAULT true NOT NULL,
	`probe_json` text,
	`last_seen_scan_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`library_root_id`) REFERENCES `library_roots`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`media_item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_files_root_fingerprint_idx` ON `media_files` (`library_root_id`,`fingerprint`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_files_root_path_idx` ON `media_files` (`library_root_id`,`relative_path`);--> statement-breakpoint
CREATE INDEX `media_files_media_item_idx` ON `media_files` (`media_item_id`);--> statement-breakpoint
CREATE INDEX `media_files_episode_idx` ON `media_files` (`episode_id`);--> statement-breakpoint
CREATE TABLE `media_genres` (
	`media_item_id` text NOT NULL,
	`genre_id` text NOT NULL,
	PRIMARY KEY(`media_item_id`, `genre_id`),
	FOREIGN KEY (`media_item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`genre_id`) REFERENCES `genres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `media_items` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`normalized_title` text NOT NULL,
	`sort_title` text NOT NULL,
	`original_title` text,
	`overview` text DEFAULT '' NOT NULL,
	`release_year` integer,
	`runtime_ms` integer,
	`original_language` text,
	`content_rating` text,
	`metadata_state` text DEFAULT 'draft' NOT NULL,
	`metadata_source` text,
	`confidence` real DEFAULT 0 NOT NULL,
	`fields_locked` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `media_items_title_idx` ON `media_items` (`normalized_title`);--> statement-breakpoint
CREATE INDEX `media_items_kind_idx` ON `media_items` (`kind`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`image_local_path` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `people_normalized_name_idx` ON `people` (`normalized_name`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`avatar` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scan_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`discovered_count` integer DEFAULT 0 NOT NULL,
	`indexed_count` integer DEFAULT 0 NOT NULL,
	`error_json` text,
	`started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`series_id` text NOT NULL,
	`season_number` integer NOT NULL,
	`title` text,
	`overview` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_series_number_idx` ON `seasons` (`series_id`,`season_number`);--> statement-breakpoint
CREATE TABLE `subtitle_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`media_file_id` text NOT NULL,
	`stream_index` integer,
	`language` text,
	`label` text NOT NULL,
	`format` text NOT NULL,
	`source_relative_path` text,
	`cached_path` text,
	`is_default` integer DEFAULT false NOT NULL,
	`forced` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`media_file_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `subtitle_tracks_media_file_idx` ON `subtitle_tracks` (`media_file_id`);--> statement-breakpoint
CREATE TABLE `trailers` (
	`id` text PRIMARY KEY NOT NULL,
	`media_item_id` text NOT NULL,
	`title` text NOT NULL,
	`youtube_url` text NOT NULL,
	`official` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`media_item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `watch_events` (
	`id` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`media_file_id` text NOT NULL,
	`kind` text NOT NULL,
	`position_ms` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_file_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `watch_events_profile_created_idx` ON `watch_events` (`profile_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `watch_progress` (
	`profile_id` text NOT NULL,
	`media_file_id` text NOT NULL,
	`position_ms` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`last_watched_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`profile_id`, `media_file_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_file_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE cascade
);
