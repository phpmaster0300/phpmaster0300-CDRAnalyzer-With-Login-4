import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import adminRoutes from "./admin-routes";
import multer from "multer";
import xlsx from "xlsx";
import { z } from "zod";
import { insertCDRRecordSchema, insertFileUploadSchema, type InsertCDRRecord, type TopNumbersResult, type LocationAnalysisResult, type LocationMovementResult, type IMEIChangeResult, type FileStats, type AnalysisData, type DailyStats, type LocationChangeResult } from "@shared/schema";
import PDFDocument from "pdfkit";

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel files (.xlsx, .xls) are allowed.'));
    }
  }
});

// Smart column mapping function
function findColumnValue(row: any, possibleNames: string[]): any {
  // First try exact matches
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
      return row[name];
    }
  }
  
  // Then try case-insensitive and partial matches
  const keys = Object.keys(row);
  for (const name of possibleNames) {
    const found = keys.find(key => 
      key.toLowerCase().includes(name.toLowerCase()) || 
      name.toLowerCase().includes(key.toLowerCase())
    );
    if (found && row[found] !== undefined && row[found] !== null && row[found] !== '') {
      return row[found];
    }
  }
  
  return '';
}

// Intelligent column detection based on data patterns
function detectColumnType(columnName: string, sampleValues: any[]): string | null {
  const name = columnName.toLowerCase();
  
  // Check data patterns in sample values
  const nonEmptyValues = sampleValues.filter(v => v !== null && v !== undefined && v !== '').slice(0, 5);
  
  // Phone number patterns (A-Party/B-Party)
  const phonePattern = /^[0-9+\-\s()]{8,20}$/;
  const hasPhoneNumbers = nonEmptyValues.some(v => phonePattern.test(String(v)));
  
  // Date/time patterns
  const isDateLike = nonEmptyValues.some(v => {
    if (typeof v === 'number' && v > 40000 && v < 50000) return true; // Excel date
    return !isNaN(Date.parse(String(v)));
  });
  
  // IMEI patterns (15 digits)
  const imeiPattern = /^[0-9E\+\-\.]{12,20}$/;
  const hasIMEI = nonEmptyValues.some(v => {
    const str = String(v);
    return str.length >= 12 && /[0-9]/.test(str) && (str.includes('E+') || imeiPattern.test(str));
  });
  
  // Call type patterns
  const hasCallTypes = nonEmptyValues.some(v => {
    const str = String(v).toLowerCase();
    return str.includes('call') || str.includes('sms') || str.includes('incoming') || str.includes('outgoing');
  });
  
  // Duration patterns (numbers)
  const hasDuration = nonEmptyValues.every(v => !isNaN(Number(v)) && Number(v) >= 0);
  
  // Location patterns
  const hasLocation = nonEmptyValues.some(v => {
    const str = String(v);
    return str.includes('|') || str.length > 10; // Location strings are usually longer
  });
  
  // Enhanced detection logic
  
  // Check if column name itself is a phone number (reuse existing pattern)
  const isPhoneColumn = phonePattern.test(name);
  
  // Check for MSISDN or Customer number patterns
  const isMsisdnColumn = name.includes('msisdn') || name.includes('customer') || name.includes('subscriber');
  
  // Phone number detection
  if (hasPhoneNumbers || isPhoneColumn || isMsisdnColumn) {
    if (name.includes('a') || name.includes('caller') || name.includes('source') || name.includes('from')) {
      return 'A-Party';
    } else if (name.includes('b') || name.includes('called') || name.includes('dest') || name.includes('to') || 
               name.includes('customer') || name.includes('msisdn') || name.includes('subscriber')) {
      return 'B-Party';
    } else if (isPhoneColumn) {
      // If column name is a phone number, treat as A-Party by default
      return 'A-Party';
    } else if (isMsisdnColumn) {
      return 'B-Party';
    }
  }
  
  if (isDateLike && (name.includes('date') || name.includes('time'))) {
    return 'Date And Time';
  }
  
  if (hasIMEI && (name.includes('imei') || name.includes('device'))) {
    return 'IMEI';
  }
  
  if (hasCallTypes && (name.includes('type') || name.includes('call'))) {
    return 'Call Type';
  }
  
  if (hasDuration && (name.includes('duration') || name.includes('time'))) {
    return 'Duration';
  }
  
  if (hasLocation && (name.includes('location') || name.includes('site') || name.includes('cell'))) {
    return 'SiteLocation';
  }
  
  return null;
}

// Enhanced column normalization with intelligent detection
function normalizeColumnNames(data: any[]): any[] {
  if (!data.length) return data;
  
  // Enhanced exact name mapping - these take absolute priority
  const exactMapping: { [key: string]: string } = {
    'A-Party': 'A-Party', 'B-Party': 'B-Party', // Exact matches first
    'Call Type': 'Call Type', 'Date And Time': 'Date And Time',
    'IMEI': 'IMEI', 'IMSI': 'IMSI', 'Duration': 'Duration',
    'Cell ID': 'Cell ID', 'SiteLocation': 'SiteLocation',
    'Aparty': 'A-Party', 'aparty': 'A-Party', 'A_Party': 'A-Party', 'AParty': 'A-Party',
    'BParty': 'B-Party', 'bparty': 'B-Party', 'B_Party': 'B-Party',
    'Customer Msisdn': 'B-Party', 'customer msisdn': 'B-Party', 'Customer MSISDN': 'B-Party',
    'Msisdn': 'B-Party', 'msisdn': 'B-Party', 'MSISDN': 'B-Party',
    'Customer Number': 'B-Party', 'customer number': 'B-Party',
    'Datetime': 'Date And Time', 'datetime': 'Date And Time', 'DateTime': 'Date And Time',
    'CallType': 'Call Type', 'calltype': 'Call Type', 'call_type': 'Call Type',
    'Imei': 'IMEI', 'imei': 'IMEI', 'Imsi': 'IMSI', 'imsi': 'IMSI',
    'cellid': 'Cell ID', 'CellID': 'Cell ID', 'cell_id': 'Cell ID',
    'duration': 'Duration', 'Location': 'SiteLocation', 'location': 'SiteLocation'
  };
  
  // Collect sample data for pattern analysis
  const sampleData = data.slice(0, 10);
  const columnTypes: { [key: string]: string } = {};
  
  // First pass: exact mapping (absolute priority)
  Object.keys(data[0]).forEach(originalKey => {
    if (exactMapping[originalKey]) {
      columnTypes[originalKey] = exactMapping[originalKey];
      console.log(`✅ Exact match: '${originalKey}' → '${exactMapping[originalKey]}'`);
    }
  });
  
  // Second pass: intelligent detection for unmapped columns only
  Object.keys(data[0]).forEach(originalKey => {
    if (!columnTypes[originalKey]) {
      const sampleValues = sampleData.map(row => row[originalKey]);
      const detectedType = detectColumnType(originalKey, sampleValues);
      if (detectedType) {
        columnTypes[originalKey] = detectedType;
        console.log(`🔍 Auto-detected: '${originalKey}' → '${detectedType}' (based on data pattern)`);
      }
    }
  });
  
  return data.map(row => {
    const normalizedRow: any = {};
    Object.keys(row).forEach(originalKey => {
      const normalizedKey = columnTypes[originalKey] || originalKey;
      normalizedRow[normalizedKey] = row[originalKey];
    });
    return normalizedRow;
  });
}

function parseExcelToCDR(buffer: Buffer, uploadId: string): InsertCDRRecord[] {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  let data = xlsx.utils.sheet_to_json(worksheet);
  
  // Show original columns
  if (data.length > 0) {
    console.log('Original Excel columns:', Object.keys(data[0]));
    
    // DEBUG: Show actual data from first few rows BEFORE any mapping
    console.log('🔍 ORIGINAL RAW DATA SAMPLE (first 2 rows):');
    data.slice(0, 2).forEach((row, index) => {
      console.log(`Row ${index + 1}:`, row);
    });
    
    // Normalize column names automatically
    data = normalizeColumnNames(data);
    
    console.log('Normalized columns:', Object.keys(data[0]));
  }

  return data.map((row: any, index: number) => {
    // Simple parsing since columns are already normalized
    const callerNumber = row['A-Party'] || '';
    const calledNumber = row['B-Party'] || '';
    const imei = row['IMEI'] || '';
    const callType = row['Call Type'] || 'call';
    const duration = parseInt(row['Duration'] || '0', 10);
    
    // Handle Excel date format (columns already normalized)  
    let timestamp = new Date();
    const dateTimeField = row['Date And Time'];
    const dateField = row['Date'];
    const timeField = row['Time'];
    
    if (dateTimeField) {
      if (typeof dateTimeField === 'string') {
        // Try parsing as text first - many CDR files have date as text
        const parsedDate = new Date(dateTimeField);
        if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 2010) {
          timestamp = parsedDate;
        } else {
          // Try different text formats common in Pakistan/CDR files
          const dateFormats = [
            dateTimeField.replace(/[/-]/g, '-'), // Normalize separators
            dateTimeField.replace(/[/-]/g, '/'), // Try forward slashes
            dateTimeField.replace(/(\d{2})[-/](\d{2})[-/](\d{4})/, '$3-$2-$1'), // DD-MM-YYYY to YYYY-MM-DD
            dateTimeField.replace(/(\d{2})[-/](\d{2})[-/](\d{2})/, '20$3-$2-$1'), // DD-MM-YY to YYYY-MM-DD
          ];
          
          for (const format of dateFormats) {
            const testDate = new Date(format);
            if (!isNaN(testDate.getTime()) && testDate.getFullYear() > 2010 && testDate.getFullYear() <= 2024) {
              timestamp = testDate;
              break;
            }
          }
        }
      } else if (typeof dateTimeField === 'number') {
        // Excel serial date conversion - assume Excel data is already in local timezone (Pakistan)
        // Convert serial to UTC first, then adjust for Pakistan timezone offset
        const utcDate = new Date((dateTimeField - 25569) * 86400 * 1000);
        
        // Since Excel data is likely already in Pakistan timezone, 
        // we need to subtract 5 hours to get the correct UTC time
        timestamp = new Date(utcDate.getTime() - (5 * 60 * 60 * 1000));
      }
    } else if (dateField && timeField) {
      // Combine separate date and time fields
      const dateStr = typeof dateField === 'number' ? 
        new Date((dateField - 25569) * 86400 * 1000).toISOString().split('T')[0] : 
        String(dateField).split('T')[0];
      const timeStr = String(timeField);
      timestamp = new Date(`${dateStr} ${timeStr}`);
    } else if (dateField) {
      // Only date available, add random time within the day
      if (typeof dateField === 'number') {
        timestamp = new Date((dateField - 25569) * 86400 * 1000);
      } else {
        timestamp = new Date(dateField);
      }
      // Add random hours, minutes, seconds for that date
      const randomHours = Math.floor(Math.random() * 24);
      const randomMinutes = Math.floor(Math.random() * 60);
      const randomSeconds = Math.floor(Math.random() * 60);
      timestamp.setHours(randomHours, randomMinutes, randomSeconds, 0);
    } else {
      // Fallback - use current time with random offset
      timestamp = new Date(Date.now() - Math.floor(Math.random() * 86400000 * 30)); // Random time in last 30 days
    }
    
    // If timestamp is invalid, use current date with random time
    if (isNaN(timestamp.getTime())) {
      timestamp = new Date();
      const randomHours = Math.floor(Math.random() * 24);
      const randomMinutes = Math.floor(Math.random() * 60);
      const randomSeconds = Math.floor(Math.random() * 60);
      timestamp.setHours(randomHours, randomMinutes, randomSeconds, 0);
    }
    
    
    // Extract location (already normalized)
    const siteLocation = row['SiteLocation'] || '';
    let location = '';
    let latitude = null;
    let longitude = null;
    
    if (siteLocation) {
      const parts = String(siteLocation).split('|');
      if (parts.length >= 3) {
        location = parts[0].trim();
        latitude = parseFloat(parts[1]);
        longitude = parseFloat(parts[2]);
        if (isNaN(latitude)) latitude = null;
        if (isNaN(longitude)) longitude = null;
      } else {
        location = String(siteLocation).trim();
      }
    }
    
    // If no coordinates from SiteLocation, try standard fields
    if (latitude === null || longitude === null) {
      const lat = parseFloat(row['Latitude'] || '0');
      const lng = parseFloat(row['Longitude'] || '0');
      if (!isNaN(lat) && !isNaN(lng)) {
        latitude = lat;
        longitude = lng;
      }
    }

    // Normalize call type - check multiple patterns
    let normalizedCallType = String(callType).toLowerCase().trim();
    
    
    
    
    // Check for SMS patterns first
    if (normalizedCallType.includes('sms') || normalizedCallType.includes('message')) {
      // Check outgoing first to avoid "in" match in "outgoing"
      if (normalizedCallType.includes('outgoing') || normalizedCallType.includes('sent') || normalizedCallType.includes('out')) {
        normalizedCallType = 'sms_sent';
      } else if (normalizedCallType.includes('incoming') || normalizedCallType.includes('received') || normalizedCallType.includes('in')) {
        normalizedCallType = 'sms_received';
      } else {
        normalizedCallType = 'sms_received'; // Default SMS to received
      }
    }
    // Check for call patterns - outgoing first to avoid "in" match in "outgoing"  
    else if (normalizedCallType.includes('outgoing') || normalizedCallType.includes('sent')) {
      normalizedCallType = 'call_outgoing';
    } else if (normalizedCallType.includes('incoming') || normalizedCallType.includes('received')) {
      normalizedCallType = 'call_incoming';
    }
    // Handle "InComing" and similar variations
    else if (normalizedCallType === 'incoming' || normalizedCallType === 'inc') {
      normalizedCallType = 'call_incoming';
    } else if (normalizedCallType === 'outgoing' || normalizedCallType === 'out') {
      normalizedCallType = 'call_outgoing';
    } else if (normalizedCallType.includes('out') && !normalizedCallType.includes('outgoing')) {
      normalizedCallType = 'call_outgoing';
    } else if (normalizedCallType.includes('in') && !normalizedCallType.includes('incoming')) {
      normalizedCallType = 'call_incoming';
    }
    // Check for voice call patterns
    else if (normalizedCallType.includes('voice') || normalizedCallType.includes('call') || normalizedCallType === 'mo' || normalizedCallType === 'mt') {
      // MO = Mobile Originated (outgoing), MT = Mobile Terminated (incoming)
      if (normalizedCallType === 'mt' || normalizedCallType.includes('terminated')) {
        normalizedCallType = 'call_incoming';
      } else if (normalizedCallType === 'mo' || normalizedCallType.includes('originated')) {
        normalizedCallType = 'call_outgoing';
      } else {
        // If it's just "call" or "voice", let's make half outgoing, half incoming
        // For debugging, let's just make them all outgoing for now
        normalizedCallType = 'call_outgoing';
      }
    } else {
      // If we can't determine the type, make it outgoing by default
      normalizedCallType = 'call_outgoing';
      
    }

    return {
      callerNumber: String(callerNumber).trim(),
      calledNumber: String(calledNumber).trim(),
      imei: String(imei).trim(),
      callType: normalizedCallType,
      duration,
      timestamp,
      location,
      latitude,
      longitude,
      uploadId,
    };
  }).filter(record => record.callerNumber); // Filter out empty records
}

function analyzeOutgoingCalls(records: InsertCDRRecord[]): TopNumbersResult[] {
  const numberStats = new Map<string, { calls: number; duration: number }>();

  
  records.forEach(record => {
    // For outgoing calls, B-Party is the called number (who you called)
    if (record.callType !== 'call_outgoing' || !record.calledNumber) return;
    
    const bPartyNumber = record.calledNumber; // The number you called
    if (!numberStats.has(bPartyNumber)) {
      numberStats.set(bPartyNumber, { calls: 0, duration: 0 });
    }
    
    const stats = numberStats.get(bPartyNumber)!;
    stats.calls++;
    stats.duration += record.duration || 0;
  });
  

  const sortedNumbers = Array.from(numberStats.entries()).map(([number, stats]) => ({
    number,
    value: stats.calls,
    displayValue: stats.calls.toString()
  }));

  return sortedNumbers
    .sort((a, b) => b.value - a.value)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function analyzeIncomingCalls(records: InsertCDRRecord[]): TopNumbersResult[] {
  const numberStats = new Map<string, { calls: number; duration: number }>();

  
  records.forEach(record => {
    // For incoming calls, B-Party is the called number (who called the subscriber)
    if (record.callType !== 'call_incoming' || !record.calledNumber) return;
    
    const bPartyNumber = record.calledNumber; // The B-Party who called the subscriber
    if (!numberStats.has(bPartyNumber)) {
      numberStats.set(bPartyNumber, { calls: 0, duration: 0 });
    }
    
    const stats = numberStats.get(bPartyNumber)!;
    stats.calls++;
    stats.duration += record.duration || 0;
  });
  

  const sortedNumbers = Array.from(numberStats.entries()).map(([number, stats]) => ({
    number,
    value: stats.calls,
    displayValue: stats.calls.toString()
  }));

  return sortedNumbers
    .sort((a, b) => b.value - a.value)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function analyzeOutgoingSMS(records: InsertCDRRecord[]): TopNumbersResult[] {
  const numberStats = new Map<string, { sms: number }>();


  records.forEach(record => {
    // For outgoing SMS, B-Party is the called number (who you sent SMS to)
    if (record.callType !== 'sms_sent' || !record.calledNumber) return;
    
    const bPartyNumber = record.calledNumber; // The number you sent SMS to
    if (!numberStats.has(bPartyNumber)) {
      numberStats.set(bPartyNumber, { sms: 0 });
    }
    
    const stats = numberStats.get(bPartyNumber)!;
    stats.sms++;
  });

  const sortedNumbers = Array.from(numberStats.entries()).map(([number, stats]) => ({
    number,
    value: stats.sms,
    displayValue: stats.sms.toString()
  }));

  return sortedNumbers
    .sort((a, b) => b.value - a.value)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function analyzeIncomingSMS(records: InsertCDRRecord[]): TopNumbersResult[] {
  const numberStats = new Map<string, { sms: number }>();


  records.forEach(record => {
    // For incoming SMS, B-Party is the called number (who sent SMS to subscriber)  
    if (record.callType !== 'sms_received' || !record.calledNumber) return;
    
    const bPartyNumber = record.calledNumber; // The B-Party who sent SMS to subscriber
    if (!numberStats.has(bPartyNumber)) {
      numberStats.set(bPartyNumber, { sms: 0 });
    }
    
    const stats = numberStats.get(bPartyNumber)!;
    stats.sms++;
  });

  const sortedNumbers = Array.from(numberStats.entries()).map(([number, stats]) => ({
    number,
    value: stats.sms,
    displayValue: stats.sms.toString()
  }));

  return sortedNumbers
    .sort((a, b) => b.value - a.value)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function analyzeTopNumbers(records: InsertCDRRecord[], type: 'calls' | 'duration' | 'sms_sent' | 'sms_received'): TopNumbersResult[] {
  const numberStats = new Map<string, { calls: number; duration: number; smsSent: number; smsReceived: number }>();

  records.forEach(record => {
    // Use B-Party (called number) for analysis instead of A-Party (caller)
    const targetNumber = record.calledNumber || record.callerNumber;
    if (!targetNumber) return;
    
    if (!numberStats.has(targetNumber)) {
      numberStats.set(targetNumber, { calls: 0, duration: 0, smsSent: 0, smsReceived: 0 });
    }
    
    const stats = numberStats.get(targetNumber)!;
    
    if (record.callType === 'call_incoming' || record.callType === 'call_outgoing') {
      stats.calls++;
      stats.duration += record.duration || 0;
    } else if (record.callType === 'sms_sent') {
      stats.smsReceived++; // B-Party receives SMS when A-Party sends
    } else if (record.callType === 'sms_received') {
      stats.smsSent++; // B-Party sends SMS when A-Party receives
    }
  });

  const sortedNumbers = Array.from(numberStats.entries()).map(([number, stats]) => {
    let value: number;
    let displayValue: string;
    
    switch (type) {
      case 'calls':
        value = stats.calls;
        displayValue = value.toString();
        break;
      case 'duration':
        value = stats.duration;
        displayValue = formatDuration(value);
        break;
      case 'sms_sent':
        value = stats.smsSent;
        displayValue = value.toString();
        break;
      case 'sms_received':
        value = stats.smsReceived;
        displayValue = value.toString();
        break;
    }
    
    return { number, value, displayValue };
  });

  return sortedNumbers
    .sort((a, b) => b.value - a.value)
    .slice(0, 200)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function getTimeBasedActivity(timestamps: Date[]) {
  const hourlyActivity = new Array(24).fill(0);
  const dailyActivity = new Array(7).fill(0);
  
  timestamps.forEach(timestamp => {
    const hour = timestamp.getHours();
    const day = timestamp.getDay(); // 0 = Sunday, 1 = Monday, etc.
    hourlyActivity[hour]++;
    dailyActivity[day]++;
  });
  
  const peakHour = hourlyActivity.indexOf(Math.max(...hourlyActivity));
  const peakDay = dailyActivity.indexOf(Math.max(...dailyActivity));
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  return {
    peakHour: `${peakHour}:00`,
    peakDay: dayNames[peakDay],
    hourlyDistribution: hourlyActivity,
    activityScore: Math.max(...hourlyActivity) + Math.max(...dailyActivity)
  };
}

function analyzeDetailedLocationTimeline(records: InsertCDRRecord[]) {
  // Group records by subscriber number and create timeline
  const subscriberTimelines = new Map<string, Array<{
    timestamp: Date;
    location: string;
    coordinates: { lat: number; lng: number } | null;
    callType: string;
    calledNumber: string;
    duration: number;
  }>>();

  records
    .filter(record => record.location && record.callerNumber)
    .forEach(record => {
      const subscriber = record.callerNumber;
      if (!subscriberTimelines.has(subscriber)) {
        subscriberTimelines.set(subscriber, []);
      }
      
      subscriberTimelines.get(subscriber)!.push({
        timestamp: record.timestamp,
        location: record.location!,
        coordinates: record.latitude && record.longitude ? 
          { lat: record.latitude, lng: record.longitude } : null,
        callType: record.callType,
        calledNumber: record.calledNumber || '',
        duration: record.duration || 0
      });
    });

  // Analyze location changes and activity per location
  const locationChanges: Array<{
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
    };
  }> = [];

  subscriberTimelines.forEach((timeline, subscriber) => {
    // Sort by timestamp
    timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    let currentLocation = timeline[0]?.location;
    let locationStartTime = timeline[0]?.timestamp;
    
    for (let i = 1; i < timeline.length; i++) {
      const record = timeline[i];
      
      if (record.location !== currentLocation) {
        // Location changed - analyze activity in new location
        const newLocationStart = record.timestamp;
        const nextLocationIndex = timeline.findIndex((r, idx) => 
          idx > i && r.location !== record.location
        );
        const newLocationEnd = nextLocationIndex !== -1 ? 
          timeline[nextLocationIndex].timestamp : 
          timeline[timeline.length - 1].timestamp;
        
        // Get all activity in the new location
        const newLocationActivity = timeline.filter((r, idx) => 
          idx >= i && r.location === record.location &&
          r.timestamp <= newLocationEnd
        );

        // Store actual CDR records for detailed view
        const detailedRecords = newLocationActivity.map(activity => ({
          timestamp: activity.timestamp.toISOString(),
          callType: activity.callType,
          number: activity.calledNumber,
          duration: activity.duration
        }));
        
        // Analyze communication patterns with detailed breakdowns
        const stats = {
          incomingCalls: 0,
          outgoingCalls: 0,
          incomingSms: 0,
          outgoingSms: 0,
          totalDuration: 0,
          contactCounts: new Map<string, number>(),
          callNumbers: new Set<string>(),
          smsNumbers: new Set<string>(),
          incomingCallNumbers: new Set<string>(),
          outgoingCallNumbers: new Set<string>(),
          incomingSmsNumbers: new Set<string>(),
          outgoingSmsNumbers: new Set<string>()
        };
        
        newLocationActivity.forEach(activity => {
          const targetNumber = activity.calledNumber || 'Unknown';
          
          if (activity.callType === 'call_incoming') {
            stats.incomingCalls++;
            stats.incomingCallNumbers.add(targetNumber);
          }
          if (activity.callType === 'call_outgoing') {
            stats.outgoingCalls++;
            stats.outgoingCallNumbers.add(targetNumber);
          }
          if (activity.callType === 'sms_received') {
            stats.incomingSms++;
            stats.incomingSmsNumbers.add(targetNumber);
          }
          if (activity.callType === 'sms_sent') {
            stats.outgoingSms++;
            stats.outgoingSmsNumbers.add(targetNumber);
          }
          
          stats.totalDuration += activity.duration;
          
          if (targetNumber !== 'Unknown') {
            const count = stats.contactCounts.get(targetNumber) || 0;
            stats.contactCounts.set(targetNumber, count + 1);
            
            if (activity.callType.includes('call')) {
              stats.callNumbers.add(targetNumber);
            } else {
              stats.smsNumbers.add(targetNumber);
            }
          }
        });
        
        // Find top contacted number
        let topNumber = '';
        let topCount = 0;
        stats.contactCounts.forEach((count, number) => {
          if (count > topCount) {
            topNumber = number;
            topCount = count;
          }
        });
        
        // Calculate stay duration
        const stayDurationMs = newLocationEnd.getTime() - newLocationStart.getTime();
        const stayHours = Math.floor(stayDurationMs / (1000 * 60 * 60));
        const stayMinutes = Math.floor((stayDurationMs % (1000 * 60 * 60)) / (1000 * 60));
        const stayDuration = stayHours > 0 ? `${stayHours}h ${stayMinutes}m` : `${stayMinutes}m`;
        
        locationChanges.push({
          subscriber,
          changeTime: record.timestamp.toISOString(),
          fromLocation: currentLocation || 'Unknown',
          toLocation: record.location,
          coordinates: record.coordinates,
          activityInNewLocation: {
            incomingCalls: stats.incomingCalls,
            outgoingCalls: stats.outgoingCalls,
            incomingSms: stats.incomingSms,
            outgoingSms: stats.outgoingSms,
            totalDuration: stats.totalDuration,
            topContactedNumber: topNumber,
            topContactCount: topCount,
            stayDuration,
            uniqueContacts: stats.contactCounts.size,
            // Enhanced number details
            incomingCallNumbers: Array.from(stats.incomingCallNumbers).slice(0, 5),
            outgoingCallNumbers: Array.from(stats.outgoingCallNumbers).slice(0, 5), 
            incomingSmsNumbers: Array.from(stats.incomingSmsNumbers).slice(0, 5),
            outgoingSmsNumbers: Array.from(stats.outgoingSmsNumbers).slice(0, 5),
            totalCallNumbers: stats.callNumbers.size,
            totalSmsNumbers: stats.smsNumbers.size,
            // Actual CDR records for details view
            detailedRecords: detailedRecords
          }
        });
        
        currentLocation = record.location;
        locationStartTime = record.timestamp;
      }
    }
  });
  
  return locationChanges
    .sort((a, b) => new Date(b.changeTime).getTime() - new Date(a.changeTime).getTime())
    .slice(0, 20);
}

function analyzeSpecificNumber(records: InsertCDRRecord[], targetNumber: string) {
  // Filter records for the target number (both as caller and called)
  const numberRecords = records.filter(record => 
    record.callerNumber === targetNumber || record.calledNumber === targetNumber
  );

  if (numberRecords.length === 0) {
    return null;
  }

  // Group by date for daily analysis
  const dailyData = new Map<string, {
    date: string;
    calls: number;
    sms: number;
    duration: number;
    records: InsertCDRRecord[];
  }>();

  numberRecords.forEach(record => {
    const dateStr = record.timestamp.toISOString().split('T')[0];
    
    if (!dailyData.has(dateStr)) {
      dailyData.set(dateStr, {
        date: dateStr,
        calls: 0,
        sms: 0,
        duration: 0,
        records: []
      });
    }

    const dayData = dailyData.get(dateStr)!;
    dayData.records.push(record);
    
    if (record.callType.includes('call')) {
      dayData.calls++;
      dayData.duration += record.duration || 0;
    } else if (record.callType.includes('sms')) {
      dayData.sms++;
    }
  });

  const dailyBreakdown = Array.from(dailyData.values())
    .map(day => ({
      date: day.date,
      calls: day.calls,
      sms: day.sms,
      duration: day.duration,
      total: day.calls + day.sms,
      records: day.records
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
        .map(record => ({
          timestamp: record.timestamp.toISOString(),
          callType: record.callType,
          duration: record.duration || 0,
          callerNumber: record.callerNumber,
          calledNumber: record.calledNumber,
          location: record.location
        }))
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Calculate stats
  const totalCalls = dailyBreakdown.reduce((sum, day) => sum + day.calls, 0);
  const totalSms = dailyBreakdown.reduce((sum, day) => sum + day.sms, 0);
  const totalDuration = dailyBreakdown.reduce((sum, day) => sum + day.duration, 0);
  const activeDays = dailyBreakdown.filter(day => day.total > 0);

  // Find most and least active days
  const activeDaysWithData = activeDays.filter(day => day.total > 0);
  const mostActiveDay = activeDaysWithData.length > 0 ? 
    activeDaysWithData.reduce((max, day) => day.total > max.total ? day : max) : null;
  const leastActiveDay = activeDaysWithData.length > 0 ? 
    activeDaysWithData.reduce((min, day) => day.total < min.total ? day : min) : null;

  return {
    number: targetNumber,
    totalDays: activeDays.length,
    totalCalls,
    totalSms,
    totalDuration,
    avgPerDay: activeDays.length > 0 ? (totalCalls + totalSms) / activeDays.length : 0,
    mostActiveDay: mostActiveDay ? {
      date: new Date(mostActiveDay.date).toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric' 
      }),
      calls: mostActiveDay.calls,
      sms: mostActiveDay.sms,
      duration: mostActiveDay.duration,
      total: mostActiveDay.total
    } : null,
    leastActiveDay: leastActiveDay ? {
      date: new Date(leastActiveDay.date).toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric' 
      }),
      calls: leastActiveDay.calls,
      sms: leastActiveDay.sms,
      duration: leastActiveDay.duration,
      total: leastActiveDay.total
    } : null,
    dailyBreakdown: dailyBreakdown.slice(0, 90) // Limit to 90 days
  };
}

function analyzeLocationPatterns(records: InsertCDRRecord[]): LocationAnalysisResult[] {
  const locationStats = new Map<string, {
    calls: number;
    duration: number;
    numbers: Set<string>;
    timestamps: Date[];
    coordinates: { lat: number; lng: number } | null;
    callTypes: { voice: number; sms: number };
  }>();

  // Include both calls and SMS for location analysis
  records
    .filter(record => record.location && (record.callType.includes('call') || record.callType.includes('sms')))
    .forEach(record => {
      if (!locationStats.has(record.location!)) {
        locationStats.set(record.location!, {
          calls: 0,
          duration: 0,
          numbers: new Set(),
          timestamps: [],
          coordinates: record.latitude && record.longitude ? 
            { lat: record.latitude, lng: record.longitude } : null,
          callTypes: { voice: 0, sms: 0 }
        });
      }
      
      const stats = locationStats.get(record.location!)!;
      stats.calls++;
      stats.duration += record.duration || 0;
      stats.numbers.add(record.calledNumber || record.callerNumber);
      stats.timestamps.push(record.timestamp);
      
      // Track call types
      if (record.callType.includes('call')) {
        stats.callTypes.voice++;
      } else if (record.callType.includes('sms')) {
        stats.callTypes.sms++;
      }
    });

  return Array.from(locationStats.entries())
    .filter(([, stats]) => stats.calls >= 3) // Lowered threshold for more insights
    .map(([location, stats]) => {
      const timeActivity = getTimeBasedActivity(stats.timestamps);
      
      return {
        location,
        coordinates: stats.coordinates || { lat: 0, lng: 0 },
        calls: stats.calls,
        duration: stats.duration,
        numbers: Array.from(stats.numbers),
        timeRange: {
          start: new Date(Math.min(...stats.timestamps.map(t => t.getTime()))).toISOString(),
          end: new Date(Math.max(...stats.timestamps.map(t => t.getTime()))).toISOString(),
        },
        primaryNumber: Array.from(stats.numbers)[0] || '',
        // Enhanced data
        peakActivity: {
          hour: timeActivity.peakHour,
          day: timeActivity.peakDay,
          score: timeActivity.activityScore
        },
        communicationMix: {
          voice: stats.callTypes.voice,
          sms: stats.callTypes.sms,
          voicePercent: Math.round((stats.callTypes.voice / stats.calls) * 100),
          smsPercent: Math.round((stats.callTypes.sms / stats.calls) * 100)
        },
        avgDuration: Math.round(stats.duration / Math.max(stats.callTypes.voice, 1)),
        uniqueContacts: stats.numbers.length
      };
    })
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 30);
}

function analyzeMovementPatterns(records: InsertCDRRecord[]): LocationMovementResult[] {
  const numberMovements = new Map<string, Array<{ location: string; timestamp: Date; calls: number; duration: number }>>();

  // Group by number and sort by timestamp
  records
    .filter(record => record.location && record.callType === 'call')
    .forEach(record => {
      const targetNumber = record.calledNumber || record.callerNumber;
      if (!targetNumber) return;
      
      if (!numberMovements.has(targetNumber)) {
        numberMovements.set(targetNumber, []);
      }
      numberMovements.get(targetNumber)!.push({
        location: record.location!,
        timestamp: record.timestamp,
        calls: 1,
        duration: record.duration || 0,
      });
    });

  const movementResults: LocationMovementResult[] = [];

  for (const [number, movements] of numberMovements.entries()) {
    const sortedMovements = movements.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const changes: LocationMovementResult['changes'] = [];
    
    let previousLocation = '';
    let callsAfterMove = 0;
    let durationAfterMove = 0;
    
    sortedMovements.forEach((movement, index) => {
      if (previousLocation && previousLocation !== movement.location) {
        changes.push({
          fromLocation: previousLocation,
          toLocation: movement.location,
          timestamp: movement.timestamp.toISOString(),
          callsAfter: callsAfterMove,
          durationAfter: durationAfterMove,
        });
        callsAfterMove = 0;
        durationAfterMove = 0;
      }
      
      callsAfterMove += movement.calls;
      durationAfterMove += movement.duration;
      previousLocation = movement.location;
    });

    if (changes.length > 0) {
      const mobilityLevel = changes.length > 15 ? 'high' : changes.length > 8 ? 'medium' : 'low';
      movementResults.push({
        number,
        changes,
        totalChanges: changes.length,
        mobilityLevel,
      });
    }
  }

  return movementResults
    .sort((a, b) => b.totalChanges - a.totalChanges)
    .slice(0, 50);
}

function analyzeIMEIChanges(records: InsertCDRRecord[]): IMEIChangeResult[] {
  const numberIMEIs = new Map<string, Array<{ imei: string; timestamp: Date; calls: number; duration: number; smsSent: number; smsReceived: number }>>();

  records.forEach(record => {
    if (!record.imei) return;
    
    const targetNumber = record.calledNumber || record.callerNumber;
    if (!targetNumber) return;
    
    if (!numberIMEIs.has(targetNumber)) {
      numberIMEIs.set(targetNumber, []);
    }
    
    const existing = numberIMEIs.get(targetNumber)!.find(item => item.imei === record.imei);
    if (existing) {
      if (record.callType === 'call') {
        existing.calls++;
        existing.duration += record.duration || 0;
      } else if (record.callType === 'sms_sent') {
        existing.smsSent++;
      } else if (record.callType === 'sms_received') {
        existing.smsReceived++;
      }
    } else {
      numberIMEIs.get(targetNumber)!.push({
        imei: record.imei,
        timestamp: record.timestamp,
        calls: record.callType === 'call' ? 1 : 0,
        duration: record.callType === 'call' ? (record.duration || 0) : 0,
        smsSent: record.callType === 'sms_sent' ? 1 : 0,
        smsReceived: record.callType === 'sms_received' ? 1 : 0,
      });
    }
  });

  const imeiChangeResults: IMEIChangeResult[] = [];

  for (const [number, imeiData] of numberIMEIs.entries()) {
    if (imeiData.length <= 1) continue; // No IMEI changes
    
    const sortedIMEIs = imeiData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const changes: IMEIChangeResult['changes'] = [];
    
    for (let i = 1; i < sortedIMEIs.length; i++) {
      const current = sortedIMEIs[i];
      const previous = sortedIMEIs[i - 1];
      
      changes.push({
        timestamp: current.timestamp.toISOString(),
        oldIMEI: previous.imei,
        newIMEI: current.imei,
        callsAfter: current.calls,
        durationAfter: current.duration,
        smsAfter: { sent: current.smsSent, received: current.smsReceived },
      });
    }

    imeiChangeResults.push({
      number,
      changes,
      totalChanges: changes.length,
    });
  }

  return imeiChangeResults
    .sort((a, b) => b.totalChanges - a.totalChanges)
    .slice(0, 50);
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function generateDailyBreakdown(records: InsertCDRRecord[]): DailyStats[] {
  const dailyStats = new Map<string, { incomingCalls: number; outgoingCalls: number; incomingSms: number; outgoingSms: number }>();

  records.forEach(record => {
    const date = record.timestamp.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    if (!dailyStats.has(date)) {
      dailyStats.set(date, { incomingCalls: 0, outgoingCalls: 0, incomingSms: 0, outgoingSms: 0 });
    }
    
    const stats = dailyStats.get(date)!;
    
    if (record.callType === 'call_incoming') {
      stats.incomingCalls++;
    } else if (record.callType === 'call_outgoing') {
      stats.outgoingCalls++;
    } else if (record.callType === 'sms_received') {
      stats.incomingSms++;
    } else if (record.callType === 'sms_sent') {
      stats.outgoingSms++;
    }
  });

  return Array.from(dailyStats.entries())
    .map(([date, stats]) => ({
      date,
      ...stats
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function generateFileStats(records: InsertCDRRecord[], processingTime: number): FileStats {
  const uniqueNumbers = new Set(records.map(r => r.callerNumber)).size;
  const timestamps = records.map(r => r.timestamp.getTime()).filter(t => !isNaN(t));
  const dateRange = timestamps.length > 0 ? 
    Math.ceil((Math.max(...timestamps) - Math.min(...timestamps)) / (1000 * 60 * 60 * 24)) : 0;

  const dailyBreakdown = generateDailyBreakdown(records);

  return {
    totalRecords: records.length,
    uniqueNumbers,
    dateRange: `${dateRange} Days`,
    processingTime: `${(processingTime / 1000).toFixed(1)}s`,
    dailyBreakdown,
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Upload and process CDR file
  app.post("/api/upload", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const startTime = Date.now();
      
      // Create file upload record
      const fileUpload = await storage.createFileUpload({
        filename: req.file.filename || req.file.originalname,
        originalName: req.file.originalname,
        processingStatus: "processing",
      });

      // Parse Excel file
      const cdrRecords = parseExcelToCDR(req.file.buffer, fileUpload.id);
      
      if (cdrRecords.length === 0) {
        await storage.updateFileUpload(fileUpload.id, { processingStatus: "failed" });
        return res.status(400).json({ message: "No valid CDR records found in the file" });
      }

      // Store CDR records
      await storage.createCDRRecords(cdrRecords);
      
      const processingTime = Date.now() - startTime;
      
      // Generate all analyses
      const fileStats = generateFileStats(cdrRecords, processingTime);
      const topCallNumbers = analyzeTopNumbers(cdrRecords, 'calls');
      const topTalkTimeNumbers = analyzeTopNumbers(cdrRecords, 'duration');
      
      // Separate incoming/outgoing talk time analysis
      const outgoingCallRecords = cdrRecords.filter(r => r.callType === 'call_outgoing');
      const incomingCallRecords = cdrRecords.filter(r => r.callType === 'call_incoming');
      
      // Calculate talk time for top outgoing call numbers
      const topOutgoingCallNumbers = analyzeOutgoingCalls(cdrRecords);
      const topOutgoingTalkTime = topOutgoingCallNumbers.map(item => {
        const totalDuration = cdrRecords
          .filter(r => (r.callType === 'call_outgoing' || r.callType === 'call_incoming') && 
                      (r.callerNumber === item.number || r.calledNumber === item.number))
          .reduce((sum, r) => sum + (r.duration || 0), 0);
        
        return {
          ...item,
          value: totalDuration,
          displayValue: formatDuration(totalDuration)
        };
      }).sort((a, b) => b.value - a.value);

      // Calculate talk time for top incoming call numbers  
      const topIncomingCallNumbers = analyzeIncomingCalls(cdrRecords);
      const topIncomingTalkTime = topIncomingCallNumbers.map(item => {
        const totalDuration = cdrRecords
          .filter(r => (r.callType === 'call_outgoing' || r.callType === 'call_incoming') && 
                      (r.callerNumber === item.number || r.calledNumber === item.number))
          .reduce((sum, r) => sum + (r.duration || 0), 0);
        
        return {
          ...item,
          value: totalDuration,
          displayValue: formatDuration(totalDuration)
        };
      }).sort((a, b) => b.value - a.value);
      const topSmsSentNumbers = analyzeTopNumbers(cdrRecords, 'sms_sent');
      const topSmsReceivedNumbers = analyzeTopNumbers(cdrRecords, 'sms_received');
      const topOutgoingCalls = analyzeOutgoingCalls(cdrRecords);
      const topIncomingCalls = analyzeIncomingCalls(cdrRecords);
      const topOutgoingSMS = analyzeOutgoingSMS(cdrRecords);
      const topIncomingSMS = analyzeIncomingSMS(cdrRecords);
      const locationAnalysis = analyzeLocationPatterns(cdrRecords);
      const movementPatterns = analyzeMovementPatterns(cdrRecords);
      const detailedLocationTimeline = analyzeDetailedLocationTimeline(cdrRecords);
      const imeiChanges = analyzeIMEIChanges(cdrRecords);

      // Store analysis results
      await storage.createAnalysisResult({ uploadId: fileUpload.id, analysisType: 'fileStats', results: fileStats });
      await storage.createAnalysisResult({ uploadId: fileUpload.id, analysisType: 'topCallNumbers', results: topCallNumbers });
      await storage.createAnalysisResult({ uploadId: fileUpload.id, analysisType: 'topTalkTimeNumbers', results: topTalkTimeNumbers });
      await storage.createAnalysisResult({ uploadId: fileUpload.id, analysisType: 'topOutgoingTalkTime', results: topOutgoingTalkTime });
      await storage.createAnalysisResult({ uploadId: fileUpload.id, analysisType: 'topIncomingTalkTime', results: topIncomingTalkTime });
      await storage.createAnalysisResult({ uploadId: fileUpload.id, analysisType: 'topSmsSentNumbers', results: topSmsSentNumbers });
      await storage.createAnalysisResult({ uploadId: fileUpload.id, analysisType: 'topSmsReceivedNumbers', results: topSmsReceivedNumbers });
      await storage.createAnalysisResult({ uploadId: fileUpload.id, analysisType: 'topOutgoingCalls', results: topOutgoingCalls });
      await storage.createAnalysisResult({ uploadId: fileUpload.id, analysisType: 'topIncomingCalls', results: topIncomingCalls });
      await storage.createAnalysisResult({ uploadId: fileUpload.id, analysisType: 'topOutgoingSMS', results: topOutgoingSMS });
      await storage.createAnalysisResult({ uploadId: fileUpload.id, analysisType: 'topIncomingSMS', results: topIncomingSMS });
      await storage.createAnalysisResult({ uploadId: fileUpload.id, analysisType: 'locationAnalysis', results: locationAnalysis });
      await storage.createAnalysisResult({ uploadId: fileUpload.id, analysisType: 'movementPatterns', results: movementPatterns });
      await storage.createAnalysisResult({ uploadId: fileUpload.id, analysisType: 'detailedLocationTimeline', results: detailedLocationTimeline });
      await storage.createAnalysisResult({ uploadId: fileUpload.id, analysisType: 'imeiChanges', results: imeiChanges });

      // Update file upload status
      await storage.updateFileUpload(fileUpload.id, { 
        processingStatus: "completed",
        totalRecords: cdrRecords.length,
        uniqueNumbers: fileStats.uniqueNumbers,
      });

      res.json({ 
        message: "File processed successfully", 
        uploadId: fileUpload.id,
        analysis: {
          fileStats,
          topCallNumbers,
          topTalkTimeNumbers,
          topOutgoingTalkTime,
          topIncomingTalkTime,
          topSmsSentNumbers,
          topSmsReceivedNumbers,
          topOutgoingCalls,
          topIncomingCalls,
          topOutgoingSMS,
          topIncomingSMS,
          locationAnalysis,
          movementPatterns,
          detailedLocationTimeline,
          imeiChanges,
        }
      });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : "File processing failed" });
    }
  });

  // Get analysis results
  app.get("/api/analysis/:uploadId", async (req, res) => {
    try {
      const { uploadId } = req.params;
      const analysis = await storage.getCompleteAnalysis(uploadId);
      
      if (!analysis) {
        return res.status(404).json({ message: "Analysis not found" });
      }

      res.json(analysis);
    } catch (error) {
      console.error('Analysis fetch error:', error);
      res.status(500).json({ message: "Failed to fetch analysis" });
    }
  });

  // Get activities for a specific date
  app.get("/api/date-analysis/:uploadId/:date", async (req, res) => {
    try {
      const { uploadId, date } = req.params;
      const selectedDate = new Date(date);
      const nextDate = new Date(selectedDate);
      nextDate.setDate(nextDate.getDate() + 1);
      
      const allRecords = await storage.getCDRRecordsByUploadId(uploadId);
      
      // Filter records for the specific date
      const dateRecords = allRecords.filter(record => {
        const recordDate = new Date(record.timestamp);
        return recordDate >= selectedDate && recordDate < nextDate;
      });

      // Group by activity type and sort by time
      const sortedRecords = dateRecords.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const activities = {
        outgoingCalls: sortedRecords.filter(r => r.callType === 'call_outgoing'),
        incomingCalls: sortedRecords.filter(r => r.callType === 'call_incoming'), 
        outgoingSMS: sortedRecords.filter(r => r.callType === 'sms_sent'),
        incomingSMS: sortedRecords.filter(r => r.callType === 'sms_received'),
        totalActivities: sortedRecords.length
      };

      res.json({
        date: date,
        activities,
        timeline: sortedRecords.map(record => ({
          time: record.timestamp,
          type: record.callType,
          caller: record.callerNumber,
          called: record.calledNumber,
          duration: record.duration,
          location: record.location,
          imei: record.imei
        }))
      });
    } catch (error) {
      console.error('Date analysis error:', error);
      res.status(500).json({ message: "Failed to fetch date analysis" });
    }
  });

  // Export number details as HTML
  app.post("/api/export-number-html", async (req, res) => {
    try {
      console.log('Number details export request received:', req.body);
      const { number, totalRecords, records } = req.body;
      
      if (!number || !totalRecords || !records) {
        return res.status(400).json({ message: "Missing required data" });
      }
      
      const formatTime = (timestamp: string) => {
        const d = new Date(timestamp);
        return d.toLocaleString('en-US', {
          timeZone: 'Asia/Karachi',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
      };

      const formatDuration = (seconds: number) => {
        if (seconds <= 0) return '-';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
      };

      const getCallTypeIcon = (type: string) => {
        switch (type) {
          case 'call_outgoing': return '📞';
          case 'call_incoming': return '📞';
          case 'sms_sent': return '📤';
          case 'sms_received': return '📥';
          default: return '⏰';
        }
      };

      const getCallTypeLabel = (type: string) => {
        switch (type) {
          case 'call_outgoing': return 'Outgoing Call';
          case 'call_incoming': return 'Incoming Call';
          case 'sms_sent': return 'SMS Sent';
          case 'sms_received': return 'SMS Received';
          default: return type;
        }
      };

      const getCallTypeColor = (type: string) => {
        switch (type) {
          case 'call_outgoing': return 'background-color: #dbeafe; color: #1e40af; border: 1px solid #93c5fd;';
          case 'call_incoming': return 'background-color: #dcfce7; color: #166534; border: 1px solid #86efac;';
          case 'sms_sent': return 'background-color: #fed7aa; color: #c2410c; border: 1px solid #fdba74;';
          case 'sms_received': return 'background-color: #e9d5ff; color: #7c3aed; border: 1px solid #c4b5fd;';
          default: return 'background-color: #f3f4f6; color: #374151; border: 1px solid #d1d5db;';
        }
      };
      
      // Create HTML content
      let htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Number Details Analysis - ${number}</title>
    <style>
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: #f9fafb;
            color: #374151;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: #f8fafc;
            padding: 24px;
            border-bottom: 1px solid #e5e7eb;
        }
        .title {
            font-size: 24px;
            font-weight: 600;
            color: #1f2937;
            margin: 0 0 8px 0;
            display: flex;
            align-items: center;
        }
        .description {
            color: #6b7280;
            margin: 0;
        }
        .content {
            padding: 24px;
        }
        .summary-section {
            background-color: #f9fafb;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 32px;
            border: 1px solid #e5e7eb;
        }
        .summary-title {
            font-size: 16px;
            font-weight: 600;
            color: #1f2937;
            margin: 0 0 8px 0;
        }
        .summary-text {
            font-size: 14px;
            color: #6b7280;
            margin: 0;
        }
        .records-section {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            overflow: hidden;
        }
        .records-header {
            background-color: #f9fafb;
            padding: 20px 24px;
            border-bottom: 1px solid #e5e7eb;
        }
        .records-title {
            font-size: 18px;
            font-weight: 600;
            color: #1f2937;
            margin: 0 0 4px 0;
        }
        .records-subtitle {
            font-size: 14px;
            color: #6b7280;
            margin: 0;
        }
        .records-content {
            max-height: 600px;
            overflow-y: auto;
        }
        .record {
            padding: 20px 24px;
            border-bottom: 1px solid #f3f4f6;
            display: flex;
            gap: 16px;
        }
        .record:last-child {
            border-bottom: none;
        }
        .record:hover {
            background-color: #f9fafb;
        }
        .record-icon {
            font-size: 16px;
            margin-top: 2px;
        }
        .record-content {
            flex: 1;
        }
        .record-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 8px;
        }
        .record-badge {
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }
        .record-time {
            font-size: 14px;
            font-weight: 500;
            color: #1f2937;
        }
        .record-details {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 8px;
            font-size: 14px;
            color: #6b7280;
        }
        .record-detail strong {
            font-weight: 500;
            color: #1f2937;
        }
        .record-location {
            margin-top: 8px;
            font-size: 12px;
            color: #6b7280;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .generated-info {
            text-align: center;
            margin-top: 32px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            color: #6b7280;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">📞 Number Details Analysis</h1>
            <p class="description">Complete record details for phone number: ${number}</p>
        </div>
        
        <div class="content">
            <!-- Summary -->
            <div class="summary-section">
                <h4 class="summary-title">Summary</h4>
                <p class="summary-text">Total Records: <strong>${totalRecords}</strong></p>
            </div>

            <!-- Records -->
            <div class="records-section">
                <div class="records-header">
                    <h3 class="records-title">Complete Records</h3>
                    <p class="records-subtitle">All communication activities for this number</p>
                </div>
                
                <div class="records-content">
`;

      if (records.length > 0) {
        records.forEach((record: any, index: number) => {
          htmlContent += `
                    <div class="record">
                        <div class="record-icon">${getCallTypeIcon(record.callType)}</div>
                        <div class="record-content">
                            <div class="record-header">
                                <span class="record-badge" style="${getCallTypeColor(record.callType)}">${getCallTypeLabel(record.callType)}</span>
                                <span class="record-time">${formatTime(record.timestamp)}</span>
                            </div>
                            <div class="record-details">
                                <div><strong>Other Party:</strong> ${record.otherParty || 'Unknown'}</div>
                                <div><strong>Duration:</strong> ${(record.callType === 'call_outgoing' || record.callType === 'call_incoming') ? formatDuration(record.duration) : '-'}</div>
                            </div>
                            ${record.location ? `
                            <div class="record-location">
                                📍 ${record.location}
                            </div>
                            ` : ''}
                        </div>
                    </div>
`;
        });
      } else {
        htmlContent += `
                    <div style="text-align: center; padding: 40px; color: #6b7280;">
                        No records available
                    </div>
`;
      }

      htmlContent += `
                </div>
            </div>
            
            <div class="generated-info">
                Generated by CDR Analysis System - KALEEM ULLAH GOPANG<br>
                Export Date: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' })}
            </div>
        </div>
    </div>
</body>
</html>`;
      
      console.log('HTML content length:', htmlContent.length);
      
      // Set headers for HTML download
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="number-details-${number}-${new Date().toISOString().split('T')[0]}.html"`,
        'Content-Length': Buffer.byteLength(htmlContent, 'utf8')
      });
      
      res.end(htmlContent, 'utf8');
      
    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({ message: "Failed to export number details" });
    }
  });

  // Export daily analysis as HTML
  app.post("/api/export-date-analysis", async (req, res) => {
    try {
      console.log('Daily analysis export request received:', req.body);
      const { date, activities, timeline } = req.body;
      
      if (!date || !activities || !timeline) {
        return res.status(400).json({ message: "Missing required data" });
      }
      
      const formatTime = (timestamp: string) => {
        const d = new Date(timestamp);
        return d.toLocaleString('en-US', {
          timeZone: 'Asia/Karachi',
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
      };

      const formatDuration = (seconds: number) => {
        if (seconds <= 0) return '-';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
      };

      const getActivityIcon = (type: string) => {
        switch (type) {
          case 'call_outgoing': return '📞';
          case 'call_incoming': return '📞';
          case 'sms_sent': return '📤';
          case 'sms_received': return '📥';
          default: return '⏰';
        }
      };

      const getActivityLabel = (type: string) => {
        switch (type) {
          case 'call_outgoing': return 'Outgoing Call';
          case 'call_incoming': return 'Incoming Call';
          case 'sms_sent': return 'SMS Sent';
          case 'sms_received': return 'SMS Received';
          default: return type;
        }
      };

      const getActivityColor = (type: string) => {
        switch (type) {
          case 'call_outgoing': return 'background-color: #dbeafe; color: #1e40af; border: 1px solid #93c5fd;';
          case 'call_incoming': return 'background-color: #dcfce7; color: #166534; border: 1px solid #86efac;';
          case 'sms_sent': return 'background-color: #fed7aa; color: #c2410c; border: 1px solid #fdba74;';
          case 'sms_received': return 'background-color: #e9d5ff; color: #7c3aed; border: 1px solid #c4b5fd;';
          default: return 'background-color: #f3f4f6; color: #374151; border: 1px solid #d1d5db;';
        }
      };
      
      // Create HTML content with same styling as the component
      let htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Daily Activity Analysis - ${new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</title>
    <style>
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: #f9fafb;
            color: #374151;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: #f8fafc;
            padding: 24px;
            border-bottom: 1px solid #e5e7eb;
        }
        .title {
            font-size: 24px;
            font-weight: 600;
            color: #1f2937;
            margin: 0 0 8px 0;
            display: flex;
            align-items: center;
        }
        .description {
            color: #6b7280;
            margin: 0;
        }
        .content {
            padding: 24px;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 32px;
        }
        .summary-card {
            text-align: center;
            padding: 20px;
            border-radius: 8px;
            border-width: 1px;
        }
        .summary-card.outgoing {
            background-color: #eff6ff;
            border-color: #bfdbfe;
        }
        .summary-card.incoming {
            background-color: #f0fdf4;
            border-color: #bbf7d0;
        }
        .summary-card.sms-sent {
            background-color: #fff7ed;
            border-color: #fed7aa;
        }
        .summary-card.sms-received {
            background-color: #faf5ff;
            border-color: #e9d5ff;
        }
        .summary-number {
            font-size: 24px;
            font-weight: 700;
            margin: 8px 0;
        }
        .summary-label {
            font-size: 14px;
            font-weight: 500;
        }
        .timeline-section {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            overflow: hidden;
        }
        .timeline-header {
            background-color: #f9fafb;
            padding: 20px 24px;
            border-bottom: 1px solid #e5e7eb;
        }
        .timeline-title {
            font-size: 18px;
            font-weight: 600;
            color: #1f2937;
            margin: 0 0 4px 0;
        }
        .timeline-subtitle {
            font-size: 14px;
            color: #6b7280;
            margin: 0;
        }
        .timeline-content {
            max-height: 600px;
            overflow-y: auto;
        }
        .activity {
            padding: 20px 24px;
            border-bottom: 1px solid #f3f4f6;
            display: flex;
            gap: 16px;
        }
        .activity:last-child {
            border-bottom: none;
        }
        .activity:hover {
            background-color: #f9fafb;
        }
        .activity-icon {
            font-size: 16px;
            margin-top: 2px;
        }
        .activity-content {
            flex: 1;
        }
        .activity-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 8px;
        }
        .activity-badge {
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }
        .activity-time {
            font-size: 14px;
            font-weight: 500;
            color: #1f2937;
        }
        .activity-details {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 8px;
            font-size: 14px;
            color: #6b7280;
        }
        .activity-detail strong {
            font-weight: 500;
            color: #1f2937;
        }
        .activity-location {
            margin-top: 8px;
            font-size: 12px;
            color: #6b7280;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .generated-info {
            text-align: center;
            margin-top: 32px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            color: #6b7280;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">📅 Daily Activity Analysis</h1>
            <p class="description">Complete timeline of all calls and SMS activities for ${new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        
        <div class="content">
            <!-- Summary Cards -->
            <div class="summary-grid">
                <div class="summary-card outgoing">
                    <div style="font-size: 24px; margin-bottom: 8px;">📞</div>
                    <div class="summary-number" style="color: #1e40af;">${activities.outgoingCalls.length}</div>
                    <div class="summary-label" style="color: #1e40af;">Outgoing Calls</div>
                </div>
                
                <div class="summary-card incoming">
                    <div style="font-size: 24px; margin-bottom: 8px;">📞</div>
                    <div class="summary-number" style="color: #166534;">${activities.incomingCalls.length}</div>
                    <div class="summary-label" style="color: #166534;">Incoming Calls</div>
                </div>

                <div class="summary-card sms-sent">
                    <div style="font-size: 24px; margin-bottom: 8px;">📤</div>
                    <div class="summary-number" style="color: #c2410c;">${activities.outgoingSMS.length}</div>
                    <div class="summary-label" style="color: #c2410c;">SMS Sent</div>
                </div>

                <div class="summary-card sms-received">
                    <div style="font-size: 24px; margin-bottom: 8px;">📥</div>
                    <div class="summary-number" style="color: #7c3aed;">${activities.incomingSMS.length}</div>
                    <div class="summary-label" style="color: #7c3aed;">SMS Received</div>
                </div>
            </div>

            <!-- Timeline -->
            <div class="timeline-section">
                <div class="timeline-header">
                    <h3 class="timeline-title">Complete Activity Timeline</h3>
                    <p class="timeline-subtitle">Total Activities: ${activities.totalActivities}</p>
                </div>
                
                <div class="timeline-content">
`;

      if (timeline.length > 0) {
        timeline.forEach((activity: any) => {
          htmlContent += `
                    <div class="activity">
                        <div class="activity-icon">${getActivityIcon(activity.type)}</div>
                        <div class="activity-content">
                            <div class="activity-header">
                                <span class="activity-badge" style="${getActivityColor(activity.type)}">${getActivityLabel(activity.type)}</span>
                                <span class="activity-time">${formatTime(activity.time)}</span>
                            </div>
                            <div class="activity-details">
                                <div><strong>From:</strong> ${activity.caller}</div>
                                <div><strong>To:</strong> ${activity.called}</div>
                                <div><strong>Duration:</strong> ${formatDuration(activity.duration)}</div>
                            </div>
                            ${activity.location ? `
                            <div class="activity-location">
                                📍 ${activity.location}
                                ${activity.imei ? `📱 ${activity.imei.substring(0, 8)}...` : ''}
                            </div>
                            ` : ''}
                        </div>
                    </div>
`;
        });
      } else {
        htmlContent += `
                    <div style="text-align: center; padding: 40px; color: #6b7280;">
                        No activities found for the selected date
                    </div>
`;
      }

      htmlContent += `
                </div>
            </div>
            
            <div class="generated-info">
                Generated by CDR Analysis System - KALEEM ULLAH GOPANG<br>
                Export Date: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' })}
            </div>
        </div>
    </div>
</body>
</html>`;
      
      console.log('HTML content length:', htmlContent.length);
      
      // Set headers for HTML download
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="daily-analysis-${date}.html"`,
        'Content-Length': Buffer.byteLength(htmlContent, 'utf8')
      });
      
      res.end(htmlContent, 'utf8');
      
    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({ message: "Failed to export daily analysis" });
    }
  });

  // Get detailed records for a specific number
  app.get("/api/number-details/:uploadId/:number", async (req, res) => {
    try {
      const { uploadId, number } = req.params;
      const { callType } = req.query; // Optional filter for call type
      const allRecords = await storage.getCDRRecordsByUploadId(uploadId);
      
      if (allRecords.length === 0) {
        return res.status(404).json({ message: "No records found" });
      }

      // Filter records for the specific number (either as caller or called)
      let numberRecords = allRecords.filter(record => 
        record.callerNumber === number || record.calledNumber === number
      );

      // Apply call type filter if provided (for specific table context)
      if (callType && typeof callType === 'string') {
        numberRecords = numberRecords.filter(record => record.callType === callType);
      }

      // Sort by timestamp
      const sortedRecords = numberRecords.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );


      // Format the records for display
      const formattedRecords = sortedRecords.map(record => {
        // For B-Party analysis: always show B-Party number based on call direction
        let bPartyNumber;
        if (record.callType === 'call_outgoing' || record.callType === 'sms_sent') {
          // Outgoing: B-Party is who received (called number)
          bPartyNumber = record.calledNumber;
        } else {
          // Incoming: B-Party is who initiated (caller number) 
          bPartyNumber = record.callerNumber;
        }

        return {
          id: record.id,
          callType: record.callType,
          otherParty: bPartyNumber, // Always show B-Party number
          direction: record.callerNumber === number ? 'outgoing' : 'incoming',
          duration: record.duration || 0,
          timestamp: record.timestamp,
          location: record.location,
          imei: record.imei,
          coordinates: record.latitude && record.longitude ? 
            { lat: record.latitude, lng: record.longitude } : null
        };
      });



      res.json({
        number,
        totalRecords: formattedRecords.length,
        records: formattedRecords
      });
    } catch (error) {
      console.error('Number details fetch error:', error);
      res.status(500).json({ message: "Failed to fetch number details" });
    }
  });

  // Generate PDF report
  app.get("/api/export/:uploadId", async (req, res) => {
    try {
      const { uploadId } = req.params;
      const analysis = await storage.getCompleteAnalysis(uploadId);
      const fileUpload = await storage.getFileUpload(uploadId);
      
      if (!analysis || !fileUpload) {
        return res.status(404).json({ message: "Analysis not found" });
      }

      const doc = new PDFDocument({ margin: 50 });
      
      // Set response headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="CDR-Analysis-${uploadId}.pdf"`);
      
      doc.pipe(res);

      // PDF Header
      doc.fontSize(20).text('CDR Intelligence Analysis Report', { align: 'center' });
      doc.fontSize(12).text(`Generated on: ${new Date().toLocaleString('en-US', { hour12: true })}`, { align: 'center' });
      doc.text(`File: ${fileUpload.originalName}`, { align: 'center' });
      doc.moveDown(2);

      // File Statistics
      doc.fontSize(16).text('File Statistics', { underline: true });
      doc.fontSize(12);
      doc.text(`Total Records: ${analysis.fileStats.totalRecords}`);
      doc.text(`Unique Numbers: ${analysis.fileStats.uniqueNumbers}`);
      doc.text(`Date Range: ${analysis.fileStats.dateRange}`);
      doc.text(`Processing Time: ${analysis.fileStats.processingTime}`);
      doc.moveDown(1);

      // Top Call Numbers
      doc.fontSize(16).text('Top 20 Numbers by Calls', { underline: true });
      doc.fontSize(10);
      analysis.topCallNumbers.slice(0, 20).forEach((item, index) => {
        doc.text(`${index + 1}. ${item.number}: ${item.displayValue} calls`);
      });
      doc.moveDown(1);

      // Top Talk Time
      doc.fontSize(16).text('Top 20 Numbers by Talk Time', { underline: true });
      doc.fontSize(10);
      analysis.topTalkTimeNumbers.slice(0, 20).forEach((item, index) => {
        doc.text(`${index + 1}. ${item.number}: ${item.displayValue}`);
      });
      doc.moveDown(1);

      // SMS Analytics
      doc.fontSize(16).text('Top 20 Numbers by SMS Sent', { underline: true });
      doc.fontSize(10);
      analysis.topSmsSentNumbers.slice(0, 20).forEach((item, index) => {
        doc.text(`${index + 1}. ${item.number}: ${item.displayValue} SMS`);
      });
      doc.moveDown(1);

      doc.fontSize(16).text('Top 20 Numbers by SMS Received', { underline: true });
      doc.fontSize(10);
      analysis.topSmsReceivedNumbers.slice(0, 20).forEach((item, index) => {
        doc.text(`${index + 1}. ${item.number}: ${item.displayValue} SMS`);
      });
      doc.moveDown(1);

      // Location Analysis
      if (analysis.locationAnalysis.length > 0) {
        doc.addPage();
        doc.fontSize(16).text('Location-Based Analysis', { underline: true });
        doc.fontSize(12);
        analysis.locationAnalysis.slice(0, 10).forEach((location, index) => {
          doc.text(`${index + 1}. ${location.location}`);
          doc.fontSize(10);
          doc.text(`   Calls: ${location.calls}, Duration: ${formatDuration(location.duration)}`);
          doc.text(`   Numbers: ${location.numbers.length} unique numbers`);
          doc.text(`   Primary: ${location.primaryNumber}`);
          doc.fontSize(12);
        });
        doc.moveDown(1);
      }

      // Movement Patterns
      if (analysis.movementPatterns.length > 0) {
        doc.fontSize(16).text('Movement Patterns', { underline: true });
        doc.fontSize(12);
        analysis.movementPatterns.slice(0, 5).forEach((pattern, index) => {
          doc.text(`${index + 1}. ${pattern.number} (${pattern.totalChanges} changes, ${pattern.mobilityLevel} mobility)`);
          doc.fontSize(10);
          pattern.changes.slice(0, 3).forEach((change) => {
            doc.text(`   ${change.fromLocation} → ${change.toLocation} at ${new Date(change.timestamp).toLocaleString('en-US', { hour12: true })}`);
          });
          doc.fontSize(12);
        });
        doc.moveDown(1);
      }

      // IMEI Changes
      if (analysis.imeiChanges.length > 0) {
        doc.fontSize(16).text('IMEI Change Detection', { underline: true });
        doc.fontSize(12);
        analysis.imeiChanges.slice(0, 5).forEach((imeiChange, index) => {
          doc.text(`${index + 1}. ${imeiChange.number} (${imeiChange.totalChanges} changes)`);
          doc.fontSize(10);
          imeiChange.changes.slice(0, 2).forEach((change) => {
            doc.text(`   ${change.oldIMEI} → ${change.newIMEI} at ${new Date(change.timestamp).toLocaleString('en-US', { hour12: true })}`);
            doc.text(`   Activity after: ${change.callsAfter} calls, ${change.smsAfter.sent} SMS sent, ${change.smsAfter.received} SMS received`);
          });
          doc.fontSize(12);
        });
      }

      doc.end();
    } catch (error) {
      console.error('PDF export error:', error);
      res.status(500).json({ message: "Failed to generate PDF report" });
    }
  });

  // Number Analysis Endpoint
  app.get("/api/number-analysis/:number", async (req, res) => {
    const { number } = req.params;
    
    try {
      // Get all CDR records from storage
      const allRecords = Array.from((storage as any).cdrRecords.values());
      
      if (!allRecords || allRecords.length === 0) {
        return res.json(null);
      }

      const analysis = analyzeSpecificNumber(allRecords, decodeURIComponent(number));
      
      res.json(analysis);
    } catch (error) {
      console.error("Error analyzing number:", error);
      res.status(500).json({ error: "Failed to analyze number" });
    }
  });

  // Export location timeline as HTML
  app.post("/api/export-location-timeline", async (req, res) => {
    try {
      console.log('Location timeline export request received:', req.body);
      const { timeline, totalChanges } = req.body;
      
      if (!timeline || !totalChanges) {
        return res.status(400).json({ message: "Missing required data" });
      }
      
      const formatTime = (timestamp: string) => {
        const d = new Date(timestamp);
        return d.toLocaleString('en-US', {
          timeZone: 'Asia/Karachi',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
      };

      const formatDuration = (seconds: number) => {
        if (seconds <= 0) return '-';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
          return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
      };
      
      // Create HTML content
      let htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Location Timeline & Communication Analysis</title>
    <style>
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: #f9fafb;
            color: #374151;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 24px;
        }
        .title {
            font-size: 24px;
            font-weight: 600;
            margin: 0 0 8px 0;
            display: flex;
            align-items: center;
        }
        .description {
            opacity: 0.9;
            margin: 0;
        }
        .content {
            padding: 24px;
        }
        .summary-section {
            background-color: #f9fafb;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 32px;
            border: 1px solid #e5e7eb;
        }
        .summary-title {
            font-size: 16px;
            font-weight: 600;
            color: #1f2937;
            margin: 0 0 8px 0;
        }
        .summary-text {
            font-size: 14px;
            color: #6b7280;
            margin: 0;
        }
        .timeline-section {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            overflow: hidden;
        }
        .timeline-header {
            background: linear-gradient(to right, #f3f4f6, #e5e7eb);
            padding: 20px 24px;
            border-bottom: 1px solid #e5e7eb;
        }
        .timeline-title {
            font-size: 18px;
            font-weight: 600;
            color: #1f2937;
            margin: 0 0 4px 0;
        }
        .timeline-subtitle {
            font-size: 14px;
            color: #6b7280;
            margin: 0;
        }
        .timeline-content {
            max-height: none;
        }
        .timeline-item {
            padding: 24px;
            border-bottom: 1px solid #f3f4f6;
            background: linear-gradient(to right, #eff6ff, #f0f9ff);
            border-left: 4px solid #3b82f6;
        }
        .timeline-item:last-child {
            border-bottom: none;
        }
        .timeline-header-section {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 16px;
            flex-wrap: wrap;
            gap: 12px;
        }
        .timeline-time {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
        }
        .timeline-time-icon {
            font-size: 16px;
        }
        .timeline-time-text {
            font-size: 14px;
            font-weight: 500;
            color: #1f2937;
        }
        .timeline-location {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            color: #6b7280;
            flex-wrap: wrap;
        }
        .location-from {
            color: #6b7280;
        }
        .location-arrow {
            color: #3b82f6;
            font-weight: bold;
        }
        .location-to {
            color: #3b82f6;
            font-weight: 500;
        }
        .duration-badge {
            background-color: #3b82f6;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }
        .activity-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 16px;
            margin-bottom: 16px;
        }
        .activity-stats {
            background-color: rgba(255,255,255,0.6);
            border-radius: 8px;
            padding: 16px;
            border: 1px solid rgba(255,255,255,0.3);
        }
        .activity-title {
            font-size: 12px;
            font-weight: 500;
            color: #374151;
            margin-bottom: 8px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            text-align: center;
        }
        .stat-item {
            padding: 8px 4px;
        }
        .stat-value {
            font-weight: bold;
            font-size: 16px;
            margin-bottom: 2px;
        }
        .stat-label {
            font-size: 10px;
            color: #6b7280;
        }
        .incoming-call { color: #10b981; }
        .outgoing-call { color: #3b82f6; }
        .incoming-sms { color: #8b5cf6; }
        .outgoing-sms { color: #f59e0b; }
        .contact-numbers {
            background-color: rgba(255,255,255,0.6);
            border-radius: 8px;
            padding: 16px;
            border: 1px solid rgba(255,255,255,0.3);
        }
        .contact-title {
            font-size: 12px;
            font-weight: 500;
            color: #374151;
            margin-bottom: 8px;
        }
        .contact-item {
            margin-bottom: 8px;
            font-size: 12px;
        }
        .contact-type {
            font-weight: 500;
            margin-right: 4px;
        }
        .contact-numbers-text {
            font-family: 'Monaco', 'Menlo', monospace;
            color: #374151;
        }
        .summary-footer {
            margin-top: 16px;
            padding-top: 12px;
            border-top: 1px solid rgba(255,255,255,0.5);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 8px;
            font-size: 12px;
            color: #6b7280;
        }
        .summary-info {
            display: flex;
            gap: 16px;
            flex-wrap: wrap;
        }
        .summary-info span {
            white-space: nowrap;
        }
        .generated-info {
            text-align: center;
            margin-top: 32px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            color: #6b7280;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">📍 Location Timeline & Communication Analysis</h1>
            <p class="description">Detailed movement patterns and communication activities</p>
        </div>
        
        <div class="content">
            <!-- Summary -->
            <div class="summary-section">
                <h4 class="summary-title">Summary</h4>
                <p class="summary-text">Total Location Changes: <strong>${totalChanges}</strong></p>
            </div>

            <!-- Timeline -->
            <div class="timeline-section">
                <div class="timeline-header">
                    <h3 class="timeline-title">Location Changes Timeline</h3>
                    <p class="timeline-subtitle">Chronological movement and communication patterns</p>
                </div>
                
                <div class="timeline-content">
`;

      if (timeline.length > 0) {
        timeline.slice(0, 15).forEach((change: any, index: number) => {
          htmlContent += `
                    <div class="timeline-item">
                        <!-- Header Section -->
                        <div class="timeline-header-section">
                            <div style="flex: 1;">
                                <div class="timeline-time">
                                    <span class="timeline-time-icon">⏰</span>
                                    <span class="timeline-time-text">${formatTime(change.changeTime)}</span>
                                </div>
                                <div class="timeline-location">
                                    <span>📍</span>
                                    <span class="location-from">${change.fromLocation}</span>
                                    <span class="location-arrow">→</span>
                                    <span class="location-to">${change.toLocation}</span>
                                </div>
                            </div>
                            <span class="duration-badge">${change.activityInNewLocation.stayDuration}</span>
                        </div>

                        <!-- Activity Grid -->
                        <div class="activity-grid">
                            <!-- Activity Stats -->
                            <div class="activity-stats">
                                <div class="activity-title">Communication Activity</div>
                                <div class="stats-grid">
                                    <div class="stat-item">
                                        <div class="stat-value incoming-call">${change.activityInNewLocation.incomingCalls}</div>
                                        <div class="stat-label">In Call</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value outgoing-call">${change.activityInNewLocation.outgoingCalls}</div>
                                        <div class="stat-label">Out Call</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value incoming-sms">${change.activityInNewLocation.incomingSms}</div>
                                        <div class="stat-label">In SMS</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-value outgoing-sms">${change.activityInNewLocation.outgoingSms}</div>
                                        <div class="stat-label">Out SMS</div>
                                    </div>
                                </div>
                            </div>

                            <!-- Contact Numbers -->
                            <div class="contact-numbers">
                                <div class="contact-title">Contact Numbers</div>
`;

          // Add contact numbers if available
          if (change.activityInNewLocation.incomingCallNumbers.length > 0) {
            htmlContent += `
                                <div class="contact-item">
                                    <span class="contact-type incoming-call">In Calls:</span>
                                    <span class="contact-numbers-text">${change.activityInNewLocation.incomingCallNumbers.join(', ')}</span>
                                </div>
`;
          }
          
          if (change.activityInNewLocation.outgoingCallNumbers.length > 0) {
            htmlContent += `
                                <div class="contact-item">
                                    <span class="contact-type outgoing-call">Out Calls:</span>
                                    <span class="contact-numbers-text">${change.activityInNewLocation.outgoingCallNumbers.join(', ')}</span>
                                </div>
`;
          }
          
          if (change.activityInNewLocation.incomingSmsNumbers.length > 0) {
            htmlContent += `
                                <div class="contact-item">
                                    <span class="contact-type incoming-sms">In SMS:</span>
                                    <span class="contact-numbers-text">${change.activityInNewLocation.incomingSmsNumbers.join(', ')}</span>
                                </div>
`;
          }
          
          if (change.activityInNewLocation.outgoingSmsNumbers.length > 0) {
            htmlContent += `
                                <div class="contact-item">
                                    <span class="contact-type outgoing-sms">Out SMS:</span>
                                    <span class="contact-numbers-text">${change.activityInNewLocation.outgoingSmsNumbers.join(', ')}</span>
                                </div>
`;
          }

          htmlContent += `
                            </div>
                        </div>

                        <!-- Summary Footer -->
                        <div class="summary-footer">
                            <div class="summary-info">
                                <span><strong>Duration:</strong> ${formatDuration(change.activityInNewLocation.totalDuration)}</span>
                                <span><strong>Contacts:</strong> ${change.activityInNewLocation.uniqueContacts}</span>
                                <span><strong>Top Contact:</strong> ${change.activityInNewLocation.topContactedNumber || 'None'} (${change.activityInNewLocation.topContactCount}x)</span>
                            </div>
                        </div>
                    </div>
`;
        });

        if (timeline.length > 15) {
          htmlContent += `
                    <div style="text-align: center; padding: 20px; color: #6b7280; background-color: #f9fafb;">
                        Showing 15 recent changes • ${timeline.length} total changes
                    </div>
`;
        }
      } else {
        htmlContent += `
                    <div style="text-align: center; padding: 40px; color: #6b7280;">
                        No location changes detected in the data
                    </div>
`;
      }

      htmlContent += `
                </div>
            </div>
            
            <div class="generated-info">
                Generated by CDR Analysis System - KALEEM ULLAH GOPANG<br>
                Export Date: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' })}
            </div>
        </div>
    </div>
</body>
</html>`;
      
      console.log('Location timeline HTML content length:', htmlContent.length);
      
      // Set headers for HTML download
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="location-timeline-${new Date().toISOString().split('T')[0]}.html"`,
        'Content-Length': Buffer.byteLength(htmlContent, 'utf8')
      });
      
      res.end(htmlContent, 'utf8');
      
    } catch (error) {
      console.error('Location timeline export error:', error);
      res.status(500).json({ message: "Failed to export location timeline" });
    }
  });

  // Export detailed records as HTML
  app.post("/api/export-detailed-records", async (req, res) => {
    try {
      console.log('Detailed records export request received. Records count:', req.body?.records?.length, 'Total:', req.body?.totalRecords, 'Location:', req.body?.location);
      const { records, totalRecords, location } = req.body;
      
      if (!records || !totalRecords) {
        return res.status(400).json({ message: "Missing required data" });
      }
      
      const formatTime = (timestamp: string) => {
        const d = new Date(timestamp);
        return d.toLocaleString('en-US', {
          timeZone: 'Asia/Karachi',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
      };

      const formatDuration = (seconds: number) => {
        if (seconds <= 0) return '-';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
          return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
      };

      const getCallTypeIcon = (type: string) => {
        switch (type) {
          case 'call_incoming': return '📞';
          case 'call_outgoing': return '📞';
          case 'sms_received': return '📥';
          case 'sms_sent': return '📤';
          default: return '⏰';
        }
      };

      const getCallTypeLabel = (type: string) => {
        switch (type) {
          case 'call_incoming': return 'Incoming Call';
          case 'call_outgoing': return 'Outgoing Call';
          case 'sms_received': return 'Incoming SMS';
          case 'sms_sent': return 'Outgoing SMS';
          default: return type;
        }
      };

      const getCallTypeColor = (type: string) => {
        switch (type) {
          case 'call_incoming': return 'background-color: #dcfce7; color: #166534; border: 1px solid #86efac;';
          case 'call_outgoing': return 'background-color: #dbeafe; color: #1e40af; border: 1px solid #93c5fd;';
          case 'sms_received': return 'background-color: #e9d5ff; color: #7c3aed; border: 1px solid #c4b5fd;';
          case 'sms_sent': return 'background-color: #fed7aa; color: #c2410c; border: 1px solid #fdba74;';
          default: return 'background-color: #f3f4f6; color: #374151; border: 1px solid #d1d5db;';
        }
      };
      
      // Create HTML content
      let htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Detailed Communication Records</title>
    <style>
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: #f9fafb;
            color: #374151;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 24px;
        }
        .title {
            font-size: 24px;
            font-weight: 600;
            margin: 0 0 8px 0;
            display: flex;
            align-items: center;
        }
        .description {
            opacity: 0.9;
            margin: 0;
        }
        .content {
            padding: 24px;
        }
        .summary-section {
            background-color: #f9fafb;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 32px;
            border: 1px solid #e5e7eb;
        }
        .summary-title {
            font-size: 16px;
            font-weight: 600;
            color: #1f2937;
            margin: 0 0 8px 0;
        }
        .summary-text {
            font-size: 14px;
            color: #6b7280;
            margin: 0;
        }
        .records-section {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            overflow: hidden;
        }
        .records-header {
            background-color: #f9fafb;
            padding: 20px 24px;
            border-bottom: 1px solid #e5e7eb;
        }
        .records-title {
            font-size: 18px;
            font-weight: 600;
            color: #1f2937;
            margin: 0 0 4px 0;
        }
        .records-subtitle {
            font-size: 14px;
            color: #6b7280;
            margin: 0;
        }
        .records-content {
            max-height: none;
        }
        .record {
            padding: 20px 24px;
            border-bottom: 1px solid #f3f4f6;
            display: flex;
            gap: 16px;
        }
        .record:last-child {
            border-bottom: none;
        }
        .record:hover {
            background-color: #f9fafb;
        }
        .record-icon {
            font-size: 16px;
            margin-top: 2px;
        }
        .record-content {
            flex: 1;
        }
        .record-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 8px;
            flex-wrap: wrap;
        }
        .record-badge {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }
        .record-time {
            font-size: 14px;
            font-weight: 500;
            color: #1f2937;
        }
        .record-details {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 8px;
            font-size: 14px;
            color: #6b7280;
        }
        .record-detail strong {
            font-weight: 500;
            color: #1f2937;
        }
        .generated-info {
            text-align: center;
            margin-top: 32px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            color: #6b7280;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">📞 Detailed Communication Records</h1>
            <p class="description">${location ? `Activity records for: ${location}` : 'Complete activity records from location timeline'}</p>
        </div>
        
        <div class="content">
            <!-- Summary -->
            <div class="summary-section">
                <h4 class="summary-title">Summary</h4>
                <p class="summary-text">Total Records: <strong>${totalRecords}</strong></p>
                ${location ? `<p class="summary-text">Location: <strong>${location}</strong></p>` : ''}
            </div>

            <!-- Records -->
            <div class="records-section">
                <div class="records-header">
                    <h3 class="records-title">Communication Records</h3>
                    <p class="records-subtitle">All calls and SMS activities</p>
                </div>
                
                <div class="records-content">
`;

      if (records.length > 0) {
        // Sort records by timestamp (newest first)
        const sortedRecords = records.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        
        sortedRecords.forEach((record: any, index: number) => {
          htmlContent += `
                    <div class="record">
                        <div class="record-icon">${getCallTypeIcon(record.callType)}</div>
                        <div class="record-content">
                            <div class="record-header">
                                <span class="record-badge" style="${getCallTypeColor(record.callType)}">${getCallTypeLabel(record.callType)}</span>
                                <span class="record-time">${formatTime(record.timestamp)}</span>
                            </div>
                            <div class="record-details">
                                <div><strong>Number:</strong> ${record.number || 'Unknown'}</div>
                                <div><strong>Duration:</strong> ${(record.callType === 'call_outgoing' || record.callType === 'call_incoming') ? formatDuration(record.duration || 0) : '-'}</div>
                            </div>
                        </div>
                    </div>
`;
        });
      } else {
        htmlContent += `
                    <div style="text-align: center; padding: 40px; color: #6b7280;">
                        No records available
                    </div>
`;
      }

      htmlContent += `
                </div>
            </div>
            
            <div class="generated-info">
                Generated by CDR Analysis System - KALEEM ULLAH GOPANG<br>
                Export Date: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' })}
            </div>
        </div>
    </div>
</body>
</html>`;
      
      console.log('Detailed records HTML content length:', htmlContent.length);
      
      // Set headers for HTML download
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="detailed-records-${new Date().toISOString().split('T')[0]}.html"`,
        'Content-Length': Buffer.byteLength(htmlContent, 'utf8')
      });
      
      res.end(htmlContent, 'utf8');
      
    } catch (error) {
      console.error('Detailed records export error:', error);
      res.status(500).json({ message: "Failed to export detailed records" });
    }
  });

  // Export IMEI analysis as HTML
  app.post("/api/export-imei-analysis", async (req, res) => {
    try {
      console.log('IMEI analysis export request received. Changes count:', req.body?.totalChanges, 'Affected numbers:', req.body?.affectedNumbers);
      const { data, totalChanges, affectedNumbers, uniqueIMEIs } = req.body;
      
      if (!data || totalChanges === undefined) {
        return res.status(400).json({ message: "Missing required data" });
      }

      function formatTime(timestamp: string) {
        return new Date(timestamp).toLocaleString('en-US', { 
          hour12: true,
          timeZone: 'Asia/Karachi',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }

      function formatDuration(seconds: number) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
      }

      function getBorderColor(changeNumber: number): string {
        if (changeNumber <= 2) return '#f59e0b'; // warning yellow
        if (changeNumber <= 5) return '#ef4444'; // danger red
        return '#dc2626'; // deep red
      }

      let htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IMEI Change Detection & Analysis</title>
    <style>
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f8fafc;
            color: #1f2937;
            line-height: 1.6;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 32px;
            text-align: center;
        }
        .title {
            margin: 0 0 8px 0;
            font-size: 28px;
            font-weight: 700;
        }
        .description {
            margin: 0;
            font-size: 16px;
            opacity: 0.9;
        }
        .content {
            padding: 32px;
        }
        .summary-section {
            background: #f8fafc;
            border-radius: 8px;
            padding: 24px;
            margin-bottom: 32px;
        }
        .summary-title {
            margin: 0 0 16px 0;
            font-size: 18px;
            font-weight: 600;
            color: #374151;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
        }
        .summary-card {
            background: white;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            border: 1px solid #e5e7eb;
        }
        .summary-number {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 8px;
        }
        .summary-label {
            font-size: 14px;
            color: #6b7280;
        }
        .danger { color: #ef4444; }
        .warning { color: #f59e0b; }
        .primary { color: #3b82f6; }
        .timeline-section {
            margin-top: 32px;
        }
        .timeline-title {
            margin: 0 0 24px 0;
            font-size: 20px;
            font-weight: 600;
            color: #374151;
        }
        .number-group {
            margin-bottom: 32px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            overflow: hidden;
        }
        .number-header {
            background: #f9fafb;
            padding: 16px 20px;
            border-bottom: 1px solid #e5e7eb;
        }
        .number-title {
            font-family: 'JetBrains Mono', monospace;
            font-size: 16px;
            font-weight: 600;
            color: #374151;
            margin: 0;
        }
        .change-item {
            padding: 20px;
            border-left: 4px solid;
            margin: 0;
        }
        .change-item:not(:last-child) {
            border-bottom: 1px solid #f3f4f6;
        }
        .change-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }
        .change-timestamp {
            font-size: 14px;
            color: #6b7280;
        }
        .change-badge {
            background: #ef4444;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }
        .imei-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-bottom: 16px;
        }
        .imei-item h5 {
            margin: 0 0 4px 0;
            font-size: 14px;
            color: #6b7280;
        }
        .imei-value {
            font-family: 'JetBrains Mono', monospace;
            font-size: 14px;
            padding: 8px 12px;
            border-radius: 4px;
            background: #f3f4f6;
            border: 1px solid #e5e7eb;
        }
        .new-imei {
            background: #dbeafe;
            border-color: #3b82f6;
        }
        .activity-section {
            background: #f8fafc;
            border-radius: 6px;
            padding: 16px;
            margin-top: 16px;
        }
        .activity-title {
            margin: 0 0 12px 0;
            font-size: 14px;
            font-weight: 600;
            color: #374151;
        }
        .activity-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 12px;
        }
        .activity-item {
            text-align: center;
        }
        .activity-label {
            font-size: 12px;
            color: #6b7280;
            margin: 0 0 4px 0;
        }
        .activity-value {
            font-size: 14px;
            font-weight: 600;
        }
        .no-data {
            text-align: center;
            padding: 40px;
            color: #6b7280;
        }
        .generated-info {
            text-align: center;
            margin-top: 32px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            color: #6b7280;
            font-size: 14px;
        }
        @media (max-width: 768px) {
            .imei-grid {
                grid-template-columns: 1fr;
            }
            .activity-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">📱 IMEI Change Detection & Analysis</h1>
            <p class="description">Comprehensive analysis of device changes and security monitoring</p>
        </div>
        
        <div class="content">
            <!-- Summary -->
            <div class="summary-section">
                <h4 class="summary-title">Analysis Summary</h4>
                <div class="summary-grid">
                    <div class="summary-card">
                        <p class="summary-number danger">${totalChanges}</p>
                        <p class="summary-label">IMEI Changes Detected</p>
                    </div>
                    <div class="summary-card">
                        <p class="summary-number warning">${affectedNumbers}</p>
                        <p class="summary-label">Numbers Affected</p>
                    </div>
                    <div class="summary-card">
                        <p class="summary-number primary">${uniqueIMEIs}</p>
                        <p class="summary-label">Unique IMEIs Found</p>
                    </div>
                </div>
            </div>

            <!-- Timeline -->
            <div class="timeline-section">
                <h3 class="timeline-title">IMEI Change Timeline</h3>`;

      if (data.length > 0) {
        data.forEach((imeiChange: any, index: number) => {
          htmlContent += `
                <div class="number-group">
                    <div class="number-header">
                        <h4 class="number-title">${imeiChange.number}</h4>
                    </div>`;

          imeiChange.changes.forEach((change: any, changeIndex: number) => {
            const borderColor = getBorderColor(changeIndex + 1);
            htmlContent += `
                    <div class="change-item" style="border-left-color: ${borderColor};">
                        <div class="change-header">
                            <span class="change-timestamp">${formatTime(change.timestamp)}</span>
                            <span class="change-badge">Change #${changeIndex + 1}</span>
                        </div>
                        
                        <div class="imei-grid">
                            <div class="imei-item">
                                <h5>Previous IMEI:</h5>
                                <p class="imei-value">${change.oldIMEI}</p>
                            </div>
                            <div class="imei-item">
                                <h5>New IMEI:</h5>
                                <p class="imei-value new-imei">${change.newIMEI}</p>
                            </div>
                        </div>
                        
                        <div class="activity-section">
                            <h5 class="activity-title">Activity After IMEI Change:</h5>
                            <div class="activity-grid">
                                <div class="activity-item">
                                    <p class="activity-label">Calls Made:</p>
                                    <p class="activity-value primary">${change.callsAfter} calls</p>
                                </div>
                                <div class="activity-item">
                                    <p class="activity-label">Total Duration:</p>
                                    <p class="activity-value warning">${formatDuration(change.durationAfter)}</p>
                                </div>
                                <div class="activity-item">
                                    <p class="activity-label">SMS Sent:</p>
                                    <p class="activity-value primary">${change.smsAfter.sent} msgs</p>
                                </div>
                                <div class="activity-item">
                                    <p class="activity-label">SMS Received:</p>
                                    <p class="activity-value danger">${change.smsAfter.received} msgs</p>
                                </div>
                            </div>
                        </div>
                    </div>`;
          });

          htmlContent += `
                </div>`;
        });
      } else {
        htmlContent += `
                <div class="no-data">
                    <p>📱 No IMEI changes detected in the uploaded data</p>
                </div>`;
      }

      htmlContent += `
            </div>
            
            <!-- Generated Info -->
            <div class="generated-info">
                <p><strong>Report Generated:</strong> ${formatTime(new Date().toISOString())} (Pakistan Standard Time)</p>
                <p><strong>Analyst:</strong> KALEEM ULLAH GOPANG</p>
            </div>
        </div>
    </div>
</body>
</html>`;

      console.log('IMEI analysis HTML content length:', htmlContent.length);
      res.setHeader('Content-Type', 'text/html');
      res.send(htmlContent);
    } catch (error) {
      console.error('Error exporting IMEI analysis:', error);
      res.status(500).json({ message: "Export failed" });
    }
  });

  // Export number analysis as HTML
  app.post("/api/export-number-analysis", async (req, res) => {
    try {
      console.log('Number analysis export request received for number:', req.body?.numberData?.number);
      const { numberData } = req.body;
      
      if (!numberData || !numberData.number) {
        return res.status(400).json({ message: "Missing required data" });
      }

      function formatTime(timestamp: string) {
        return new Date(timestamp).toLocaleString('en-US', { 
          hour12: true,
          timeZone: 'Asia/Karachi',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }

      function formatDuration(seconds: number) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
          return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
      }

      function getCallTypeIcon(callType: string) {
        if (callType.includes('incoming') && callType.includes('call')) return '📞';
        if (callType.includes('outgoing') && callType.includes('call')) return '📱';
        if (callType.includes('incoming') && callType.includes('sms')) return '📨';
        if (callType.includes('outgoing') && callType.includes('sms')) return '📤';
        return '📋';
      }

      function getCallTypeLabel(callType: string) {
        if (callType.includes('incoming') && callType.includes('call')) return 'Incoming Call';
        if (callType.includes('outgoing') && callType.includes('call')) return 'Outgoing Call';
        if (callType.includes('incoming') && callType.includes('sms')) return 'Incoming SMS';
        if (callType.includes('outgoing') && callType.includes('sms')) return 'Outgoing SMS';
        return callType;
      }

      function getCallTypeColor(callType: string) {
        if (callType.includes('incoming') && callType.includes('call')) return 'background: #dbeafe; border-color: #3b82f6;';
        if (callType.includes('outgoing') && callType.includes('call')) return 'background: #dcfce7; border-color: #22c55e;';
        if (callType.includes('incoming') && callType.includes('sms')) return 'background: #fef3c7; border-color: #f59e0b;';
        if (callType.includes('outgoing') && callType.includes('sms')) return 'background: #fee2e2; border-color: #ef4444;';
        return 'background: #f3f4f6; border-color: #6b7280;';
      }

      let htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>90-Day Number Analysis - ${numberData.number}</title>
    <style>
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f8fafc;
            color: #1f2937;
            line-height: 1.6;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
            color: white;
            padding: 32px;
            text-align: center;
        }
        .title {
            margin: 0 0 8px 0;
            font-size: 28px;
            font-weight: 700;
        }
        .number {
            font-family: 'JetBrains Mono', monospace;
            font-size: 20px;
            margin-bottom: 8px;
        }
        .description {
            margin: 0;
            font-size: 16px;
            opacity: 0.9;
        }
        .content {
            padding: 32px;
        }
        .summary-section {
            background: #f8fafc;
            border-radius: 8px;
            padding: 24px;
            margin-bottom: 32px;
        }
        .summary-title {
            margin: 0 0 16px 0;
            font-size: 18px;
            font-weight: 600;
            color: #374151;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
        }
        .summary-card {
            background: white;
            border-radius: 8px;
            padding: 16px;
            text-align: center;
            border: 1px solid #e5e7eb;
        }
        .summary-number {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 4px;
        }
        .summary-label {
            font-size: 14px;
            color: #6b7280;
        }
        .primary { color: #3b82f6; }
        .accent { color: #10b981; }
        .warning { color: #f59e0b; }
        .danger { color: #ef4444; }
        .purple { color: #8b5cf6; }
        .orange { color: #f97316; }
        .activity-section {
            margin-top: 32px;
        }
        .activity-title {
            margin: 0 0 24px 0;
            font-size: 20px;
            font-weight: 600;
            color: #374151;
        }
        .day-group {
            margin-bottom: 24px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            overflow: hidden;
        }
        .day-header {
            background: #f9fafb;
            padding: 12px 16px;
            border-bottom: 1px solid #e5e7eb;
            font-weight: 600;
            color: #374151;
        }
        .records-container {
            padding: 16px;
        }
        .record {
            display: flex;
            align-items: center;
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 8px;
            border: 1px solid;
        }
        .record:last-child {
            margin-bottom: 0;
        }
        .record-icon {
            font-size: 16px;
            margin-right: 12px;
        }
        .record-content {
            flex: 1;
        }
        .record-header {
            font-weight: 500;
            margin-bottom: 4px;
        }
        .record-details {
            font-size: 14px;
            color: #6b7280;
        }
        .record-duration {
            font-weight: 500;
            color: #374151;
        }
        .no-data {
            text-align: center;
            padding: 40px;
            color: #6b7280;
        }
        .generated-info {
            text-align: center;
            margin-top: 32px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            color: #6b7280;
            font-size: 14px;
        }
        .most-least-section {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-bottom: 24px;
        }
        .activity-card {
            border-radius: 8px;
            padding: 16px;
            border: 1px solid;
        }
        .green-card {
            background: #f0fdf4;
            border-color: #16a34a;
        }
        .red-card {
            background: #fef2f2;
            border-color: #ef4444;
        }
        .card-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
            font-weight: 600;
        }
        .green-header { color: #15803d; }
        .red-header { color: #dc2626; }
        @media (max-width: 768px) {
            .most-least-section {
                grid-template-columns: 1fr;
            }
            .summary-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">📱 90-Day Number Analysis</h1>
            <p class="number">${numberData.number}</p>
            <p class="description">Comprehensive communication pattern analysis</p>
        </div>
        
        <div class="content">
            <!-- Summary -->
            <div class="summary-section">
                <h4 class="summary-title">Analysis Summary</h4>
                <div class="summary-grid">
                    <div class="summary-card">
                        <p class="summary-number primary">${numberData.totalDays}</p>
                        <p class="summary-label">Active Days</p>
                    </div>
                    <div class="summary-card">
                        <p class="summary-number accent">${numberData.totalCalls}</p>
                        <p class="summary-label">Total Calls</p>
                    </div>
                    <div class="summary-card">
                        <p class="summary-number purple">${numberData.totalSms}</p>
                        <p class="summary-label">Total SMS</p>
                    </div>
                    <div class="summary-card">
                        <p class="summary-number orange">${Math.round(numberData.avgPerDay)}</p>
                        <p class="summary-label">Avg/Day</p>
                    </div>
                </div>
            </div>

            <!-- Most/Least Active Days -->
            <div class="most-least-section">
                <div class="activity-card green-card">
                    <div class="card-header green-header">
                        <span>📈</span>
                        <span>Most Active Day</span>
                    </div>
                    <div>
                        <div style="font-weight: bold; font-size: 16px; margin-bottom: 8px;">${numberData.mostActiveDay?.date || 'N/A'}</div>
                        <div style="color: #15803d;">
                            <div><strong>${numberData.mostActiveDay?.calls || 0}</strong> calls • <strong>${numberData.mostActiveDay?.sms || 0}</strong> SMS</div>
                            <div style="font-size: 14px; margin-top: 4px;">Duration: <strong>${formatDuration(numberData.mostActiveDay?.duration || 0)}</strong></div>
                        </div>
                    </div>
                </div>
                
                <div class="activity-card red-card">
                    <div class="card-header red-header">
                        <span>📉</span>
                        <span>Least Active Day</span>
                    </div>
                    <div>
                        <div style="font-weight: bold; font-size: 16px; margin-bottom: 8px;">${numberData.leastActiveDay?.date || 'N/A'}</div>
                        <div style="color: #dc2626;">
                            <div><strong>${numberData.leastActiveDay?.calls || 0}</strong> calls • <strong>${numberData.leastActiveDay?.sms || 0}</strong> SMS</div>
                            <div style="font-size: 14px; margin-top: 4px;">Duration: <strong>${formatDuration(numberData.leastActiveDay?.duration || 0)}</strong></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Activity Timeline -->
            <div class="activity-section">
                <h3 class="activity-title">Daily Activity Timeline</h3>`;

      if (numberData.dailyBreakdown && numberData.dailyBreakdown.length > 0) {
        // Group records by date for better organization
        const groupedByDate: { [key: string]: any[] } = {};
        
        numberData.dailyBreakdown.forEach((day: any) => {
          if (day.records && day.records.length > 0) {
            const dateKey = day.date;
            if (!groupedByDate[dateKey]) {
              groupedByDate[dateKey] = [];
            }
            groupedByDate[dateKey] = day.records;
          }
        });

        // Sort dates in descending order (newest first)
        const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

        sortedDates.forEach(date => {
          const records = groupedByDate[date];
          const dayInfo = numberData.dailyBreakdown.find((d: any) => d.date === date);
          
          htmlContent += `
                <div class="day-group">
                    <div class="day-header">
                        📅 ${new Date(date).toLocaleDateString('en-US', { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })} 
                        (${dayInfo?.calls || 0} calls • ${dayInfo?.sms || 0} SMS • ${formatDuration(dayInfo?.duration || 0)})
                    </div>
                    <div class="records-container">`;

          // Sort records by time
          const sortedRecords = records.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

          sortedRecords.forEach((record: any) => {
            htmlContent += `
                        <div class="record" style="${getCallTypeColor(record.callType)}">
                            <div class="record-icon">${getCallTypeIcon(record.callType)}</div>
                            <div class="record-content">
                                <div class="record-header">${getCallTypeLabel(record.callType)} • ${record.targetNumber || 'Unknown'}</div>
                                <div class="record-details">
                                    ${formatTime(record.timestamp)}
                                    ${(record.callType.includes('call') && record.duration) ? 
                                      ` • <span class="record-duration">${formatDuration(record.duration)}</span>` : ''}
                                    ${record.location ? ` • 📍 ${record.location}` : ''}
                                </div>
                            </div>
                        </div>`;
          });

          htmlContent += `
                    </div>
                </div>`;
        });
      } else {
        htmlContent += `
                <div class="no-data">
                    <p>📱 No detailed activity records available for this number</p>
                </div>`;
      }

      htmlContent += `
            </div>
            
            <!-- Generated Info -->
            <div class="generated-info">
                <p><strong>Report Generated:</strong> ${formatTime(new Date().toISOString())} (Pakistan Standard Time)</p>
                <p><strong>Analyst:</strong> KALEEM ULLAH GOPANG</p>
                <p><strong>Analysis Period:</strong> 90 Days Complete Record</p>
            </div>
        </div>
    </div>
</body>
</html>`;

      console.log('Number analysis HTML content length:', htmlContent.length);
      res.setHeader('Content-Type', 'text/html');
      res.send(htmlContent);
    } catch (error) {
      console.error('Error exporting number analysis:', error);
      res.status(500).json({ message: "Export failed" });
    }
  });

  // Export top numbers table as HTML
  app.post("/api/export-top-numbers-table", async (req, res) => {
    try {
      console.log('Top numbers table export request received for:', req.body?.title);
      const { title, data, valueLabel, color, totalRecords } = req.body;
      
      if (!title || !data || !Array.isArray(data)) {
        return res.status(400).json({ message: "Missing required data" });
      }

      function formatTime(timestamp: string) {
        return new Date(timestamp).toLocaleString('en-US', { 
          hour12: true,
          timeZone: 'Asia/Karachi',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }

      function getColorClass(color: string) {
        const colorMap = {
          primary: '#3b82f6',
          accent: '#10b981', 
          warning: '#f59e0b',
          danger: '#ef4444'
        };
        return colorMap[color as keyof typeof colorMap] || '#3b82f6';
      }

      function getIcon(title: string) {
        if (title.includes('Outgoing Calls')) return '📱';
        if (title.includes('Incoming Calls')) return '📞';
        if (title.includes('Outgoing SMS')) return '📤';
        if (title.includes('Incoming SMS')) return '📨';
        return '📊';
      }

      const colorHex = getColorClass(color);
      const icon = getIcon(title);

      let htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - CDR Analysis</title>
    <style>
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f8fafc;
            color: #1f2937;
            line-height: 1.6;
        }
        .container {
            max-width: 1000px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, ${colorHex} 0%, ${colorHex}cc 100%);
            color: white;
            padding: 32px;
            text-align: center;
        }
        .title {
            margin: 0 0 8px 0;
            font-size: 28px;
            font-weight: 700;
        }
        .description {
            margin: 0;
            font-size: 16px;
            opacity: 0.9;
        }
        .content {
            padding: 32px;
        }
        .summary-section {
            background: #f8fafc;
            border-radius: 8px;
            padding: 24px;
            margin-bottom: 32px;
            text-align: center;
        }
        .summary-title {
            margin: 0 0 16px 0;
            font-size: 18px;
            font-weight: 600;
            color: #374151;
        }
        .summary-number {
            font-size: 32px;
            font-weight: bold;
            color: ${colorHex};
            margin-bottom: 8px;
        }
        .summary-label {
            font-size: 16px;
            color: #6b7280;
        }
        .table-section {
            margin-top: 32px;
        }
        .table-title {
            margin: 0 0 24px 0;
            font-size: 20px;
            font-weight: 600;
            color: #374151;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .data-table {
            width: 100%;
            border-collapse: collapse;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .table-header {
            background: #f9fafb;
            border-bottom: 2px solid #e5e7eb;
        }
        .table-header th {
            padding: 16px 12px;
            text-align: left;
            font-weight: 600;
            color: #374151;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .table-header th:last-child {
            text-align: right;
        }
        .table-row {
            border-bottom: 1px solid #f3f4f6;
            transition: background-color 0.2s;
        }
        .table-row:hover {
            background-color: #f9fafb;
        }
        .table-row:nth-child(even) {
            background-color: #fafbfc;
        }
        .table-cell {
            padding: 16px 12px;
            font-size: 14px;
        }
        .rank-cell {
            color: #6b7280;
            font-weight: 500;
            width: 80px;
        }
        .number-cell {
            color: #374151;
            font-family: 'JetBrains Mono', monospace;
            font-weight: 500;
        }
        .value-cell {
            text-align: right;
            color: ${colorHex};
            font-weight: 700;
            font-size: 16px;
        }
        .rank-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            background: ${colorHex};
            color: white;
            border-radius: 50%;
            font-weight: 600;
            font-size: 12px;
        }
        .top-3 {
            background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
        }
        .generated-info {
            text-align: center;
            margin-top: 32px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            color: #6b7280;
            font-size: 14px;
        }
        @media (max-width: 768px) {
            .container {
                margin: 10px;
                border-radius: 8px;
            }
            .header {
                padding: 24px 16px;
            }
            .content {
                padding: 24px 16px;
            }
            .table-cell {
                padding: 12px 8px;
                font-size: 13px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">${icon} ${title}</h1>
            <p class="description">Complete ranking analysis with detailed statistics</p>
        </div>
        
        <div class="content">
            <!-- Summary -->
            <div class="summary-section">
                <h4 class="summary-title">Summary Statistics</h4>
                <div class="summary-number">${totalRecords}</div>
                <div class="summary-label">Total Numbers Analyzed</div>
            </div>

            <!-- Data Table -->
            <div class="table-section">
                <h3 class="table-title">
                    <span>${icon}</span>
                    <span>Ranking Details</span>
                </h3>
                
                <table class="data-table">
                    <thead class="table-header">
                        <tr>
                            <th>Rank</th>
                            <th>Phone Number</th>
                            <th>${valueLabel}</th>
                        </tr>
                    </thead>
                    <tbody>`;

      // Add data rows
      data.forEach((item: any, index: number) => {
        const isTop3 = item.rank <= 3;
        htmlContent += `
                        <tr class="table-row">
                            <td class="table-cell rank-cell">
                                <span class="rank-badge ${isTop3 ? 'top-3' : ''}">#${item.rank}</span>
                            </td>
                            <td class="table-cell number-cell">${item.number}</td>
                            <td class="table-cell value-cell">${item.displayValue}</td>
                        </tr>`;
      });

      htmlContent += `
                    </tbody>
                </table>
            </div>
            
            <!-- Generated Info -->
            <div class="generated-info">
                <p><strong>Report Generated:</strong> ${formatTime(new Date().toISOString())} (Pakistan Standard Time)</p>
                <p><strong>Analyst:</strong> KALEEM ULLAH GOPANG</p>
                <p><strong>Analysis Type:</strong> ${title}</p>
            </div>
        </div>
    </div>
</body>
</html>`;

      console.log('Top numbers table HTML content length:', htmlContent.length);
      res.setHeader('Content-Type', 'text/html');
      res.send(htmlContent);
    } catch (error) {
      console.error('Error exporting top numbers table:', error);
      res.status(500).json({ message: "Export failed" });
    }
  });

  // Export complete analysis with all Top Numbers data as HTML
  app.post("/api/export-complete-analysis", async (req, res) => {
    try {
      console.log('Complete analysis export request received');
      const { uploadId, analysisData } = req.body;
      
      if (!analysisData) {
        return res.status(400).json({ message: "Missing analysis data" });
      }

      function formatTime(timestamp: string) {
        return new Date(timestamp).toLocaleString('en-US', { 
          hour12: true,
          timeZone: 'Asia/Karachi',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }

      function formatDuration(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
          return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
      }

      function renderTopNumbersTable(title: string, data: any[], valueLabel: string, icon: string, color: string) {
        if (!data || data.length === 0) {
          return `
            <div class="table-section">
              <h3 class="table-title">
                <span>${icon}</span>
                <span>${title}</span>
              </h3>
              <p class="no-data">No data available</p>
            </div>`;
        }

        let tableHTML = `
          <div class="table-section">
            <h3 class="table-title">
              <span>${icon}</span>
              <span>${title}</span>
            </h3>
            
            <table class="data-table">
              <thead class="table-header">
                <tr>
                  <th>Rank</th>
                  <th>Phone Number</th>
                  <th>${valueLabel}</th>
                </tr>
              </thead>
              <tbody>`;

        data.forEach((item: any, index: number) => {
          const isTop3 = item.rank <= 3;
          tableHTML += `
            <tr class="table-row">
              <td class="table-cell rank-cell">
                <span class="rank-badge ${isTop3 ? 'top-3' : ''}" style="background-color: ${color};">#${item.rank}</span>
              </td>
              <td class="table-cell number-cell">${item.number}</td>
              <td class="table-cell value-cell" style="color: ${color};">${item.displayValue}</td>
            </tr>`;
        });

        tableHTML += `
              </tbody>
            </table>
          </div>`;

        return tableHTML;
      }

      let htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Complete CDR Analysis Report</title>
    <style>
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f8fafc;
            color: #1f2937;
            line-height: 1.6;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }
        .title {
            margin: 0 0 12px 0;
            font-size: 32px;
            font-weight: 700;
        }
        .subtitle {
            margin: 0 0 8px 0;
            font-size: 18px;
            opacity: 0.9;
        }
        .description {
            margin: 0;
            font-size: 16px;
            opacity: 0.8;
        }
        .content {
            padding: 40px;
        }
        .summary-section {
            background: #f8fafc;
            border-radius: 12px;
            padding: 32px;
            margin-bottom: 40px;
        }
        .summary-title {
            margin: 0 0 24px 0;
            font-size: 24px;
            font-weight: 600;
            color: #374151;
            text-align: center;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
        }
        .summary-card {
            background: white;
            border-radius: 8px;
            padding: 24px;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        .summary-number {
            font-size: 28px;
            font-weight: bold;
            margin-bottom: 8px;
        }
        .summary-label {
            font-size: 14px;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .table-section {
            margin: 40px 0;
        }
        .table-title {
            margin: 0 0 24px 0;
            font-size: 24px;
            font-weight: 600;
            color: #374151;
            display: flex;
            align-items: center;
            gap: 12px;
            padding-bottom: 12px;
            border-bottom: 3px solid #e5e7eb;
        }
        .data-table {
            width: 100%;
            border-collapse: collapse;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            margin-bottom: 32px;
        }
        .table-header {
            background: #f9fafb;
            border-bottom: 2px solid #e5e7eb;
        }
        .table-header th {
            padding: 16px 12px;
            text-align: left;
            font-weight: 600;
            color: #374151;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .table-header th:last-child {
            text-align: right;
        }
        .table-row {
            border-bottom: 1px solid #f3f4f6;
            transition: background-color 0.2s;
        }
        .table-row:hover {
            background-color: #f9fafb;
        }
        .table-row:nth-child(even) {
            background-color: #fafbfc;
        }
        .table-cell {
            padding: 16px 12px;
            font-size: 14px;
        }
        .rank-cell {
            color: #6b7280;
            font-weight: 500;
            width: 80px;
        }
        .number-cell {
            color: #374151;
            font-family: 'JetBrains Mono', monospace;
            font-weight: 500;
        }
        .value-cell {
            text-align: right;
            font-weight: 700;
            font-size: 16px;
        }
        .rank-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            color: white;
            border-radius: 50%;
            font-weight: 600;
            font-size: 12px;
        }
        .top-3 {
            background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%) !important;
        }
        .no-data {
            text-align: center;
            color: #6b7280;
            font-style: italic;
            padding: 40px;
            background: #f9fafb;
            border-radius: 8px;
        }
        .generated-info {
            text-align: center;
            margin-top: 40px;
            padding-top: 24px;
            border-top: 2px solid #e5e7eb;
            color: #6b7280;
            font-size: 14px;
        }
        @media (max-width: 768px) {
            .container {
                margin: 10px;
                border-radius: 8px;
            }
            .header {
                padding: 24px 16px;
            }
            .content {
                padding: 24px 16px;
            }
            .summary-grid {
                grid-template-columns: 1fr;
            }
            .table-cell {
                padding: 12px 8px;
                font-size: 13px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="title">📊 Complete CDR Analysis Report</h1>
            <p class="subtitle">Comprehensive Call Detail Record Intelligence Analysis</p>
            <p class="description">All Top Numbers data with detailed statistics and rankings</p>
        </div>
        
        <div class="content">
            <!-- Summary Statistics -->
            <div class="summary-section">
                <h2 class="summary-title">📈 Summary Statistics</h2>
                <div class="summary-grid">
                    <div class="summary-card">
                        <div class="summary-number" style="color: #3b82f6;">${analysisData.summaryStats?.totalCalls || 0}</div>
                        <div class="summary-label">Total Calls</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-number" style="color: #10b981;">${analysisData.summaryStats?.totalSms || 0}</div>
                        <div class="summary-label">Total SMS</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-number" style="color: #f59e0b;">${formatDuration(analysisData.summaryStats?.totalDuration || 0)}</div>
                        <div class="summary-label">Total Duration</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-number" style="color: #ef4444;">${analysisData.summaryStats?.uniqueNumbers || 0}</div>
                        <div class="summary-label">Unique Numbers</div>
                    </div>
                </div>
            </div>

            <!-- Top Numbers Tables -->
            ${renderTopNumbersTable('Top Outgoing Calls', analysisData.topOutgoingCalls, 'Total Calls', '📱', '#3b82f6')}
            ${renderTopNumbersTable('Top Incoming Calls', analysisData.topIncomingCalls, 'Total Calls', '📞', '#10b981')}
            ${renderTopNumbersTable('Top Outgoing SMS', analysisData.topOutgoingSms, 'Total SMS', '📤', '#f59e0b')}
            ${renderTopNumbersTable('Top Incoming SMS', analysisData.topIncomingSms, 'Total SMS', '📨', '#ef4444')}
            ${renderTopNumbersTable('Top Talk Time (Outgoing)', analysisData.topOutgoingTalkTime, 'Talk Duration', '📞', '#3b82f6')}
            ${renderTopNumbersTable('Top Talk Time (Incoming)', analysisData.topIncomingTalkTime, 'Talk Duration', '📲', '#10b981')}
            
            <!-- Generated Info -->
            <div class="generated-info">
                <p><strong>Report Generated:</strong> ${formatTime(new Date().toISOString())} (Pakistan Standard Time)</p>
                <p><strong>Analyst:</strong> KALEEM ULLAH GOPANG</p>
                <p><strong>Analysis Type:</strong> Complete CDR Intelligence Report</p>
                <p><strong>Upload ID:</strong> ${uploadId || 'N/A'}</p>
            </div>
        </div>
    </div>
</body>
</html>`;

      console.log('Complete analysis HTML content length:', htmlContent.length);
      res.setHeader('Content-Type', 'text/html');
      res.send(htmlContent);
    } catch (error) {
      console.error('Error exporting complete analysis:', error);
      res.status(500).json({ message: "Export failed" });
    }
  });

  // Mount admin routes
  app.use(adminRoutes);

  const httpServer = createServer(app);
  return httpServer;
}
