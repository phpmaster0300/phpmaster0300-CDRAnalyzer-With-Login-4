import { type User, type InsertUser, type CDRRecord, type InsertCDRRecord, type AnalysisResult, type InsertAnalysisResult, type FileUpload, type InsertFileUpload, type AnalysisData } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  createFileUpload(upload: InsertFileUpload): Promise<FileUpload>;
  getFileUpload(id: string): Promise<FileUpload | undefined>;
  updateFileUpload(id: string, updates: Partial<FileUpload>): Promise<FileUpload | undefined>;
  
  createCDRRecord(record: InsertCDRRecord): Promise<CDRRecord>;
  createCDRRecords(records: InsertCDRRecord[]): Promise<CDRRecord[]>;
  getCDRRecordsByUploadId(uploadId: string): Promise<CDRRecord[]>;
  
  createAnalysisResult(result: InsertAnalysisResult): Promise<AnalysisResult>;
  getAnalysisResultsByUploadId(uploadId: string): Promise<AnalysisResult[]>;
  
  getCompleteAnalysis(uploadId: string): Promise<AnalysisData | null>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private fileUploads: Map<string, FileUpload>;
  private cdrRecords: Map<string, CDRRecord>;
  private analysisResults: Map<string, AnalysisResult>;

  constructor() {
    this.users = new Map();
    this.fileUploads = new Map();
    this.cdrRecords = new Map();
    this.analysisResults = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createFileUpload(upload: InsertFileUpload): Promise<FileUpload> {
    const id = randomUUID();
    const fileUpload: FileUpload = { 
      filename: upload.filename,
      originalName: upload.originalName,
      totalRecords: upload.totalRecords ?? null,
      uniqueNumbers: upload.uniqueNumbers ?? null,
      processingStatus: upload.processingStatus ?? null,
      id, 
      createdAt: new Date() 
    };
    this.fileUploads.set(id, fileUpload);
    return fileUpload;
  }

  async getFileUpload(id: string): Promise<FileUpload | undefined> {
    return this.fileUploads.get(id);
  }

  async updateFileUpload(id: string, updates: Partial<FileUpload>): Promise<FileUpload | undefined> {
    const existing = this.fileUploads.get(id);
    if (!existing) return undefined;
    
    const updated = { ...existing, ...updates };
    this.fileUploads.set(id, updated);
    return updated;
  }

  async createCDRRecord(record: InsertCDRRecord): Promise<CDRRecord> {
    const id = randomUUID();
    const cdrRecord: CDRRecord = { 
      uploadId: record.uploadId,
      callerNumber: record.callerNumber,
      calledNumber: record.calledNumber ?? null,
      imei: record.imei ?? null,
      callType: record.callType,
      duration: record.duration ?? null,
      timestamp: record.timestamp,
      location: record.location ?? null,
      latitude: record.latitude ?? null,
      longitude: record.longitude ?? null,
      id, 
      createdAt: new Date() 
    };
    this.cdrRecords.set(id, cdrRecord);
    return cdrRecord;
  }

  async createCDRRecords(records: InsertCDRRecord[]): Promise<CDRRecord[]> {
    const createdRecords = await Promise.all(records.map(record => this.createCDRRecord(record)));
    return createdRecords;
  }

  async getCDRRecordsByUploadId(uploadId: string): Promise<CDRRecord[]> {
    return Array.from(this.cdrRecords.values()).filter(record => record.uploadId === uploadId);
  }

  async createAnalysisResult(result: InsertAnalysisResult): Promise<AnalysisResult> {
    const id = randomUUID();
    const analysisResult: AnalysisResult = { ...result, id, createdAt: new Date() };
    this.analysisResults.set(id, analysisResult);
    return analysisResult;
  }

  async getAnalysisResultsByUploadId(uploadId: string): Promise<AnalysisResult[]> {
    return Array.from(this.analysisResults.values()).filter(result => result.uploadId === uploadId);
  }

  async getCompleteAnalysis(uploadId: string): Promise<AnalysisData | null> {
    const results = await this.getAnalysisResultsByUploadId(uploadId);
    if (results.length === 0) return null;

    const analysisMap = new Map(results.map(r => [r.analysisType, r.results]));

    return {
      fileStats: analysisMap.get('fileStats') as any || {},
      topCallNumbers: analysisMap.get('topCallNumbers') as any || [],
      topTalkTimeNumbers: analysisMap.get('topTalkTimeNumbers') as any || [],
      topOutgoingTalkTime: analysisMap.get('topOutgoingTalkTime') as any || [],
      topIncomingTalkTime: analysisMap.get('topIncomingTalkTime') as any || [],
      totalCalls: analysisMap.get('fileStats')?.totalRecords || 0,
      totalSms: analysisMap.get('fileStats')?.smsCount || 0,
      totalDuration: analysisMap.get('fileStats')?.totalDuration || 0,
      uniqueNumbers: analysisMap.get('fileStats')?.uniqueNumbers || 0,
      topSmsSentNumbers: analysisMap.get('topSmsSentNumbers') as any || [],
      topSmsReceivedNumbers: analysisMap.get('topSmsReceivedNumbers') as any || [],
      topOutgoingCalls: analysisMap.get('topOutgoingCalls') as any || [],
      topIncomingCalls: analysisMap.get('topIncomingCalls') as any || [],
      topOutgoingSMS: analysisMap.get('topOutgoingSMS') as any || [],
      topIncomingSMS: analysisMap.get('topIncomingSMS') as any || [],
      locationAnalysis: analysisMap.get('locationAnalysis') as any || [],
      movementPatterns: analysisMap.get('movementPatterns') as any || [],
      detailedLocationTimeline: analysisMap.get('detailedLocationTimeline') as any || [],
      imeiChanges: analysisMap.get('imeiChanges') as any || [],
    };
  }

  async getAllCDRRecords(): Promise<CDRRecord[]> {
    return Array.from(this.cdrRecords.values());
  }
}

export const storage = new MemStorage();
