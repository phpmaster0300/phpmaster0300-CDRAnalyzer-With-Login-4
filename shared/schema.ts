import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const cdrRecords = pgTable("cdr_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callerNumber: text("caller_number").notNull(),
  calledNumber: text("called_number"),
  imei: text("imei"),
  callType: text("call_type").notNull(), // call, sms_sent, sms_received
  duration: integer("duration").default(0), // in seconds
  timestamp: timestamp("timestamp").notNull(),
  location: text("location"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  uploadId: varchar("upload_id").notNull(),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const analysisResults = pgTable("analysis_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  uploadId: varchar("upload_id").notNull(),
  analysisType: text("analysis_type").notNull(),
  results: jsonb("results").notNull(),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const fileUploads = pgTable("file_uploads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  totalRecords: integer("total_records").default(0),
  uniqueNumbers: integer("unique_numbers").default(0),
  processingStatus: text("processing_status").default("processing"), // processing, completed, failed
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertCDRRecordSchema = createInsertSchema(cdrRecords).omit({
  id: true,
  createdAt: true,
});

export const insertAnalysisResultSchema = createInsertSchema(analysisResults).omit({
  id: true,
  createdAt: true,
});

export const insertFileUploadSchema = createInsertSchema(fileUploads).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type CDRRecord = typeof cdrRecords.$inferSelect;
export type InsertCDRRecord = z.infer<typeof insertCDRRecordSchema>;
export type AnalysisResult = typeof analysisResults.$inferSelect;
export type InsertAnalysisResult = z.infer<typeof insertAnalysisResultSchema>;
export type FileUpload = typeof fileUploads.$inferSelect;
export type InsertFileUpload = z.infer<typeof insertFileUploadSchema>;

// Analysis result types
export interface TopNumbersResult {
  rank: number;
  number: string;
  value: number;
  displayValue: string;
}

export interface LocationAnalysisResult {
  location: string;
  coordinates: { lat: number; lng: number };
  calls: number;
  duration: number;
  numbers: string[];
  timeRange: { start: string; end: string };
  primaryNumber: string;
  peakActivity?: {
    hour: string;
    day: string;
    score: number;
  };
  communicationMix?: {
    voice: number;
    sms: number;
    voicePercent: number;
    smsPercent: number;
  };
  avgDuration?: number;
  uniqueContacts?: number;
}

export interface LocationMovementResult {
  number: string;
  changes: Array<{
    fromLocation: string;
    toLocation: string;
    timestamp: string;
    callsAfter: number;
    durationAfter: number;
  }>;
  totalChanges: number;
  mobilityLevel: "low" | "medium" | "high";
}

export interface IMEIChangeResult {
  number: string;
  changes: Array<{
    timestamp: string;
    oldIMEI: string;
    newIMEI: string;
    callsAfter: number;
    durationAfter: number;
    smsAfter: { sent: number; received: number };
  }>;
  totalChanges: number;
}

export interface DailyStats {
  date: string;
  incomingCalls: number;
  outgoingCalls: number;
  incomingSms: number;
  outgoingSms: number;
}

export interface FileStats {
  totalRecords: number;
  uniqueNumbers: number;
  dateRange: string;
  processingTime: string;
  dailyBreakdown: DailyStats[];
}

export interface LocationChangeResult {
  subscriber: string;
  changeTime: string;
  fromLocation: string;
  toLocation: string;
  coordinates: { lat: number; lng: number } | null;
  activityInNewLocation: {
    incomingCalls: number;
    outgoingCalls: number;
    incomingSms: number;
    outgoingSms: number;
    totalDuration: number;
    topContactedNumber: string;
    topContactCount: number;
    stayDuration: string;
    uniqueContacts: number;
    incomingCallNumbers: string[];
    outgoingCallNumbers: string[];
    incomingSmsNumbers: string[];
    outgoingSmsNumbers: string[];
    totalCallNumbers: number;
    totalSmsNumbers: number;
    detailedRecords: Array<{
      timestamp: string;
      callType: string;
      number: string;
      duration: number;
    }>;
  };
}

export interface AnalysisData {
  fileStats: FileStats;
  topCallNumbers: TopNumbersResult[];
  topTalkTimeNumbers: TopNumbersResult[];
  topTalkTime: TopNumbersResult[];
  topOutgoingTalkTime: TopNumbersResult[];
  topIncomingTalkTime: TopNumbersResult[];
  topSmsSentNumbers: TopNumbersResult[];
  topSmsReceivedNumbers: TopNumbersResult[];
  topOutgoingCalls: TopNumbersResult[];
  topIncomingCalls: TopNumbersResult[];
  topOutgoingSMS: TopNumbersResult[];
  topIncomingSMS: TopNumbersResult[];
  locationAnalysis: LocationAnalysisResult[];
  movementPatterns: LocationMovementResult[];
  detailedLocationTimeline: LocationChangeResult[];
  imeiChanges: IMEIChangeResult[];
  totalCalls?: number;
  totalSms?: number;
  totalDuration?: number;
  uniqueNumbers?: number;
}
