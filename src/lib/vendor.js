// ===== ไลบรารีจาก npm — expose เป็น global ให้ทุกโมดูลใช้ (โค้ดเดิมอ้างแบบ global) =====
import { createClient } from '@supabase/supabase-js';
import Chart from 'chart.js/auto';
import * as d3 from 'd3';
import * as XLSX from 'xlsx';

Object.assign(window, { createClient, Chart, d3, XLSX });
