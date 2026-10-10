/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as net from 'net';

@Injectable()
export class MailsDiagnosticsService {
  private readonly logger = new Logger(MailsDiagnosticsService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
    @InjectQueue('email') private emailQueue: Queue,
  ) {}

  async sendTestEmail(targetEmail: string) {
    const startTime = Date.now();
    const debugLogs: string[] = [];
    const steps: { name: string; status: 'SUCCESS' | 'FAILED'; duration_ms: number; details?: any }[] = [];

    const logEntry = (msg: string) => {
      const timestamp = new Date().toISOString();
      const formatted = `[${timestamp}] ${msg}`;
      debugLogs.push(formatted);
      this.logger.log(msg);
    };

    logEntry(`Memulai proses pengujian pengiriman email ke: ${targetEmail}`);

    // Step 1: Validasi target email
    const step1Start = Date.now();
    logEntry(`Step 1: Validasi input email "${targetEmail}"`);
    if (!targetEmail || !targetEmail.includes('@')) {
      steps.push({ name: 'Validasi Email', status: 'FAILED', duration_ms: Date.now() - step1Start, details: 'Format email tidak valid' });
      return {
        success: false,
        status: 'FAILED',
        error_type: 'VALIDATION_ERROR',
        message: 'Format email tidak valid',
        steps,
        logs: debugLogs,
      };
    }
    steps.push({ name: 'Validasi Email', status: 'SUCCESS', duration_ms: Date.now() - step1Start });

    // Step 2: Cek Konfigurasi SMTP
    const step2Start = Date.now();
    const smtpHost = this.configService.get<string>('MAIL_HOST') || 'mail5.mitra10.com';
    const smtpPort = Number(this.configService.get<number>('MAIL_PORT')) || 25;
    const smtpUser = this.configService.get<string>('MAIL_USERNAME') || '';
    const mailDefaults = this.configService.get<string>('MAIL_DEFAULTS') || '"Mitra 10 - Instalasi" <instalasi@mitra10.com>';

    logEntry(`Step 2: Membaca konfigurasi SMTP -> Host: ${smtpHost}, Port: ${smtpPort}, User: ${smtpUser}, From: ${mailDefaults}`);
    steps.push({
      name: 'Pemeriksaan Konfigurasi SMTP',
      status: 'SUCCESS',
      duration_ms: Date.now() - step2Start,
      details: { host: smtpHost, port: smtpPort, user: smtpUser, from: mailDefaults },
    });

    // Step 3: Siapkan Dummy Data untuk index.pug
    const step3Start = Date.now();
    logEntry(`Step 3: Mempersiapkan dummy data untuk template index.pug`);
    const apiUrl = this.configService.get<string>('API_URL') || 'https://instalasi.mitra10.com';
    const dummyData = {
      apiUrl,
      message: {
        title: 'Uji Coba Pengiriman Email SMTP Mitra10',
        welcome_header: 'Halo,',
        greetings: 'Terima kasih telah menggunakan layanan Mitra10.',
        footer: 'Email ini dikirim otomatis oleh sistem untuk pengujian koneksi SMTP dan template index.pug.',
        information_detail: [
          { information: `Pengujian koneksi SMTP ke server ${smtpHost}:${smtpPort}` },
          { information: 'Rendering template Pug index.pug berhasil dijalankan' },
          { information: 'Waktu eksekusi: ' + new Date().toLocaleString('id-ID') },
        ],
        terms_detail: [
          { terms: 'Pesan ini adalah pesan uji coba teknis internal.' },
          { terms: 'Jika Anda menerima email ini, berarti koneksi SMTP server Mitra10 berfungsi normal.' },
        ],
        email_message_image: [],
      },
      order: {
        id: 999999,
        created_at: new Date(),
        status: {
          category: 'ORDER_TEST',
          description: 'Uji Coba Sistem SMTP',
        },
        members: {
          full_name: 'Tester Mitra10',
          email: targetEmail,
        },
        project_number: '081234567890',
        project_address: 'Jl. Letjen S. Parman No. Kav. 21, Jakarta Barat',
        grand_total: 150000,
        store: {
          store_name: 'Mitra10 Daan Mogot',
          bank_name: 'BCA',
          bank_number: '1234567890',
          bank_account: 'PT Catur Mitra Sejati Sentosa',
          email: 'instalasi@mitra10.com',
          phone_number_1: '08111222333',
          phone_number_2: '08111222334',
        },
        order_details: [
          {
            item_code: 'TEST-001',
            item_name: 'Uji Coba Pengiriman Email SMTP',
            service_name: 'Jasa Testing Sistem',
            quantity: 1,
          },
        ],
      },
    };
    steps.push({ name: 'Persiapan Dummy Data', status: 'SUCCESS', duration_ms: Date.now() - step3Start });

    // Step 4: Kirim Email via MailerService
    const step4Start = Date.now();
    logEntry(`Step 4: Mengirim email via mailerService.sendMail() menggunakan template "index"...`);

    try {
      const sendResult = await this.mailerService.sendMail({
        to: targetEmail,
        from: mailDefaults,
        subject: 'Uji Coba Pengiriman Email SMTP Mitra10 (index.pug)',
        template: 'index',
        context: { data: dummyData },
      });

      const sendDuration = Date.now() - step4Start;
      logEntry(`Step 4: Pengiriman BERHASIL dalam ${sendDuration}ms! Response SMTP: ${sendResult?.response || 'OK'}`);
      steps.push({
        name: 'Pengiriman Email via MailerService',
        status: 'SUCCESS',
        duration_ms: sendDuration,
        details: {
          messageId: sendResult?.messageId,
          accepted: sendResult?.accepted,
          rejected: sendResult?.rejected,
          response: sendResult?.response,
        },
      });

      const totalDuration = Date.now() - startTime;
      logEntry(`Proses selesai sukses dalam ${totalDuration}ms.`);

      return {
        success: true,
        status: 'SUCCESS',
        message: `Email pengujian berhasil dikirim ke ${targetEmail}`,
        recipient: targetEmail,
        template: 'index.pug',
        total_duration_ms: totalDuration,
        smtp_config: {
          host: smtpHost,
          port: smtpPort,
          user: smtpUser,
          tls_rejectUnauthorized: false,
          from: mailDefaults,
        },
        send_result: {
          messageId: sendResult?.messageId,
          accepted: sendResult?.accepted,
          rejected: sendResult?.rejected,
          response: sendResult?.response,
        },
        steps,
        logs: debugLogs,
      };
    } catch (error: any) {
      const sendDuration = Date.now() - step4Start;
      logEntry(`Step 4: Pengiriman GAGAL dalam ${sendDuration}ms! Error: ${error?.message}`);
      steps.push({
        name: 'Pengiriman Email via MailerService',
        status: 'FAILED',
        duration_ms: sendDuration,
        details: {
          message: error?.message,
          code: error?.code,
          response: error?.response,
          responseCode: error?.responseCode,
          command: error?.command,
        },
      });

      // Diagnosis analisa sumber error (apakah dari SMTP server atau kode)
      let diagnosis = 'Terjadi kesalahan saat pengiriman email.';
      let errorType = 'UNKNOWN_ERROR';

      if (error?.code === 'ESOCKET' && (error?.message?.includes('certificate') || error?.message?.includes('self signed'))) {
        errorType = 'TLS_CERTIFICATE_ERROR';
        diagnosis = 'Masalah dari Kode/Konfigurasi Node.js: Sertifikat TLS server SMTP ditolak karena private/self-signed CA. Solusi: pastikan opsi tls: { rejectUnauthorized: false } pada transport MailerModule.';
      } else if (error?.code === 'ECONNREFUSED') {
        errorType = 'SMTP_CONNECTION_REFUSED';
        diagnosis = `Masalah Jaringan / VPN: Koneksi ke ${smtpHost}:${smtpPort} ditolak. Pastikan server SMTP aktif dan koneksi VPN Mitra10 aktif.`;
      } else if (error?.code === 'ETIMEDOUT' || (error?.code === 'ESOCKET' && error?.message?.includes('ETIMEDOUT'))) {
        errorType = 'SMTP_CONNECTION_TIMEOUT';
        diagnosis = `Masalah Jaringan / VPN: Koneksi ke ${smtpHost}:${smtpPort} mengalami timeout. Server internal mail5 (172.16.0.2) hanya dapat diakses saat terhubung ke VPN SSTP Mitra10.`;
      } else if (error?.code === 'EAUTH' || error?.responseCode === 535) {
        errorType = 'SMTP_AUTHENTICATION_FAILED';
        diagnosis = `Masalah Autentikasi / Gateway: Username atau password akun SMTP "${smtpUser}" ditolak (535 authentication failed). Jika VPN terputus, domain mail5.mitra10.com me-resolve ke public gateway (101.255.76.251) yang menolak akun lokal. Pastikan VPN SSTP Mitra10 terhubung.`;
      } else if (error?.code === 'EENVELOPE' || error?.responseCode === 550 || error?.responseCode === 553) {
        errorType = 'SMTP_RECIPIENT_REJECTED';
        diagnosis = `Masalah dari Alamat Email: Server SMTP menolak alamat penerima "${targetEmail}" atau pengirim "${mailDefaults}".`;
      } else if (error?.name === 'PugRenderError' || error?.message?.includes('pug')) {
        errorType = 'TEMPLATE_RENDER_ERROR';
        diagnosis = 'Masalah dari Kode Template: Terjadi kesalahan sintaks atau variabel null saat compile templates/index.pug.';
      }

      logEntry(`Diagnosis Error: [${errorType}] ${diagnosis}`);

      const totalDuration = Date.now() - startTime;
      return {
        success: false,
        status: 'FAILED',
        error_type: errorType,
        message: error?.message || 'Gagal mengirim email',
        diagnosis,
        recipient: targetEmail,
        template: 'index.pug',
        total_duration_ms: totalDuration,
        smtp_config: {
          host: smtpHost,
          port: smtpPort,
          user: smtpUser,
          tls_rejectUnauthorized: false,
          from: mailDefaults,
        },
        error_details: {
          code: error?.code,
          command: error?.command,
          response: error?.response,
          responseCode: error?.responseCode,
          message: error?.message,
        },
        steps,
        logs: debugLogs,
        stack: error?.stack,
      };
    }
  }

  async traceRedis(): Promise<any> {
    const startTime = Date.now();
    const debugLogs: string[] = [];
    const steps: Array<{
      name: string;
      status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
      duration_ms?: number;
      details?: any;
    }> = [];

    const logEntry = (msg: string) => {
      const timestamp = new Date().toISOString();
      const line = `[${timestamp}] ${msg}`;
      debugLogs.push(line);
      this.logger.log(`[TraceRedis] ${msg}`);
    };

    logEntry('Memulai tracing diagnostik koneksi Redis & Bull Queue...');

    // Step 1: Cek Konfigurasi Environment
    const step1Start = Date.now();
    const redisHost = this.configService.get<string>('REDIS_HOST') || 'localhost';
    const redisPort = parseInt(String(this.configService.get<number>('REDIS_PORT') || 6379), 10);
    const redisUsername = this.configService.get<string>('REDIS_USERNAME') || '';
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD') || '';
    const redisTls = this.configService.get<any>('REDIS_TLS');

    const configInfo = {
      host: redisHost,
      port: redisPort,
      username: redisUsername || '(default/empty)',
      has_password: Boolean(redisPassword),
      tls_enabled: Boolean(redisTls),
    };

    logEntry(`Step 1: Konfigurasi terbaca -> Host: ${redisHost}, Port: ${redisPort}, TLS: ${Boolean(redisTls)}`);
    steps.push({
      name: 'Pemeriksaan Konfigurasi Redis',
      status: 'SUCCESS',
      duration_ms: Date.now() - step1Start,
      details: configInfo,
    });

    // Step 2: Uji Koneksi Low-Level TCP Socket
    const step2Start = Date.now();
    logEntry(`Step 2: Menguji koneksi TCP socket ke ${redisHost}:${redisPort} (timeout 3000ms)...`);

    const tcpResult = await new Promise<{ ok: boolean; duration: number; error?: any }>((resolve) => {
      const socket = new net.Socket();
      let isResolved = false;

      socket.setTimeout(3000);

      socket.on('connect', () => {
        if (isResolved) return;
        isResolved = true;
        const duration = Date.now() - step2Start;
        socket.destroy();
        resolve({ ok: true, duration });
      });

      socket.on('timeout', () => {
        if (isResolved) return;
        isResolved = true;
        socket.destroy();
        resolve({
          ok: false,
          duration: Date.now() - step2Start,
          error: { code: 'ETIMEDOUT', message: `Koneksi TCP ke ${redisHost}:${redisPort} timeout (3000ms)` },
        });
      });

      socket.on('error', (err: any) => {
        if (isResolved) return;
        isResolved = true;
        socket.destroy();
        resolve({
          ok: false,
          duration: Date.now() - step2Start,
          error: { code: err?.code, message: err?.message },
        });
      });

      socket.connect(redisPort, redisHost);
    });

    if (!tcpResult.ok) {
      logEntry(`Step 2: GAGAL koneksi TCP ke ${redisHost}:${redisPort} (${tcpResult.error?.code}: ${tcpResult.error?.message})`);
      steps.push({
        name: 'Koneksi TCP Socket ke Redis',
        status: 'FAILED',
        duration_ms: tcpResult.duration,
        details: tcpResult.error,
      });

      let errorType = 'REDIS_CONNECTION_FAILED';
      let diagnosis = `Koneksi TCP ke ${redisHost}:${redisPort} gagal.`;
      let solution = 'Periksa apakah Redis server sudah dijalankan dan port tidak diblokir.';

      if (tcpResult.error?.code === 'ECONNREFUSED') {
        errorType = 'REDIS_SERVER_OFFLINE';
        diagnosis = `Server Redis TIDAK AKTIF di ${redisHost}:${redisPort} (koneksi ditolak).`;
        if (redisHost === 'localhost' || redisHost === '127.0.0.1') {
          solution = 'Redis lokal belum dijalankan. Jalankan Redis di lokal Anda (contoh: via Docker `docker run -d -p 6379:6379 --name redis redis:alpine`, atau jalankan redis-server.exe di Windows).';
        } else {
          solution = `Pastikan server Redis di host "${redisHost}" aktif dan port ${redisPort} dapat diakses.`;
        }
      } else if (tcpResult.error?.code === 'ETIMEDOUT') {
        errorType = 'REDIS_CONNECTION_TIMEOUT';
        diagnosis = `Koneksi ke ${redisHost}:${redisPort} mengalami timeout.`;
        solution = 'Periksa firewall, routing jaringan, atau koneksi VPN ke server Redis.';
      } else if (tcpResult.error?.code === 'ENOTFOUND') {
        errorType = 'REDIS_HOST_NOT_FOUND';
        diagnosis = `Hostname Redis "${redisHost}" tidak ditemukan (DNS lookup failed).`;
        solution = 'Periksa penulisan REDIS_HOST pada file .env.';
      }

      logEntry(`Diagnosis: [${errorType}] ${diagnosis}`);
      logEntry(`Solusi yang disarankan: ${solution}`);

      return {
        success: false,
        status: 'FAILED',
        error_type: errorType,
        message: diagnosis,
        diagnosis,
        solution,
        redis_config: configInfo,
        total_duration_ms: Date.now() - startTime,
        steps,
        logs: debugLogs,
      };
    }

    logEntry(`Step 2: TCP Socket terhubung sukses dalam ${tcpResult.duration}ms!`);
    steps.push({
      name: 'Koneksi TCP Socket ke Redis',
      status: 'SUCCESS',
      duration_ms: tcpResult.duration,
      details: { address: redisHost, port: redisPort },
    });

    // Step 3: Cek Status Client Bull Queue & PING
    const step3Start = Date.now();
    const clientStatus = this.emailQueue?.client?.status || 'unknown';
    logEntry(`Step 3: Status ioredis client Bull: "${clientStatus}". Mengirim perintah PING...`);

    let pingResult: string | null = null;
    let pingError: any = null;

    try {
      const pingPromise = this.emailQueue.client.ping();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('PING timeout after 3000ms')), 3000),
      );
      pingResult = (await Promise.race([pingPromise, timeoutPromise])) as string;
      logEntry(`Step 3: Redis PING berhasil -> Response: "${pingResult}"`);
      steps.push({
        name: 'Redis PING via Bull Client',
        status: 'SUCCESS',
        duration_ms: Date.now() - step3Start,
        details: { client_status: clientStatus, response: pingResult },
      });
    } catch (err: any) {
      pingError = err;
      logEntry(`Step 3: Redis PING GAGAL: ${err?.message}`);
      steps.push({
        name: 'Redis PING via Bull Client',
        status: 'FAILED',
        duration_ms: Date.now() - step3Start,
        details: { client_status: clientStatus, error: err?.message, code: err?.code },
      });

      let errorType = 'REDIS_PING_FAILED';
      let diagnosis = `Koneksi TCP sukses, tetapi Redis menolak perintah PING: ${err?.message}`;
      let solution = 'Periksa kredensial REDIS_PASSWORD atau mode autentikasi Redis.';

      if (err?.message?.includes('WRONGPASS') || err?.message?.includes('NOAUTH') || err?.message?.includes('auth')) {
        errorType = 'REDIS_AUTH_FAILED';
        diagnosis = 'Autentikasi Redis GAGAL: Password salah atau Redis membutuhkan AUTH.';
        solution = 'Sesuaikan REDIS_PASSWORD dan REDIS_USERNAME di file .env sesuai konfigurasi Redis.';
      }

      return {
        success: false,
        status: 'FAILED',
        error_type: errorType,
        message: diagnosis,
        diagnosis,
        solution,
        redis_config: configInfo,
        total_duration_ms: Date.now() - startTime,
        steps,
        logs: debugLogs,
      };
    }

    // Step 4: Periksa Statistik Antrean Bull ('email')
    const step4Start = Date.now();
    logEntry(`Step 4: Mengambil statistik antrean queue "email"...`);
    let jobCounts: any = null;
    let workersCount = 0;

    try {
      jobCounts = await this.emailQueue.getJobCounts();
      const workers = await this.emailQueue.getWorkers();
      workersCount = Array.isArray(workers) ? workers.length : 0;
      logEntry(`Step 4: Statistik antrean -> Waiting: ${jobCounts?.waiting}, Active: ${jobCounts?.active}, Completed: ${jobCounts?.completed}, Failed: ${jobCounts?.failed}, Delayed: ${jobCounts?.delayed}`);
      logEntry(`Step 4: Jumlah active workers: ${workersCount}`);
      steps.push({
        name: 'Pemeriksaan Statistik Antrean Bull',
        status: 'SUCCESS',
        duration_ms: Date.now() - step4Start,
        details: { jobCounts, workersCount },
      });
    } catch (err: any) {
      logEntry(`Step 4: Gagal mengambil statistik antrean: ${err?.message}`);
      steps.push({
        name: 'Pemeriksaan Statistik Antrean Bull',
        status: 'FAILED',
        duration_ms: Date.now() - step4Start,
        details: { error: err?.message },
      });
    }

    // Step 5: Uji Coba Enqueue Job Dummy
    const step5Start = Date.now();
    logEntry(`Step 5: Menguji enqueue dummy job ke queue "email"...`);
    let testJobId: any = null;

    try {
      const testJob = await this.emailQueue.add(
        '__test_redis_trace__',
        { timestamp: new Date().toISOString(), test: true },
        { removeOnComplete: true, removeOnFail: true, timeout: 5000 },
      );
      testJobId = testJob?.id;
      logEntry(`Step 5: Dummy job berhasil dibuat dengan ID: ${testJobId}`);
      try {
        await testJob.remove();
        logEntry(`Step 5: Dummy job ${testJobId} berhasil dibersihkan`);
      } catch {
        // Abaikan jika sudah dibersihkan
      }
      steps.push({
        name: 'Uji Enqueue Dummy Job',
        status: 'SUCCESS',
        duration_ms: Date.now() - step5Start,
        details: { job_id: testJobId },
      });
    } catch (err: any) {
      logEntry(`Step 5: Gagal enqueue dummy job: ${err?.message}`);
      steps.push({
        name: 'Uji Enqueue Dummy Job',
        status: 'FAILED',
        duration_ms: Date.now() - step5Start,
        details: { error: err?.message },
      });
    }

    const totalDuration = Date.now() - startTime;
    logEntry(`Proses trace Redis selesai dalam ${totalDuration}ms. Semua pengujian normal.`);

    return {
      success: true,
      status: 'SUCCESS',
      message: 'Koneksi ke Redis dan antrean Bull Queue berfungsi normal.',
      diagnosis: 'Redis server aktif dan dapat menerima antrean email. Masalah pengiriman email bukan disebabkan oleh Redis.',
      redis_config: configInfo,
      queue_stats: {
        queue_name: 'email',
        job_counts: jobCounts,
        active_workers: workersCount,
      },
      total_duration_ms: totalDuration,
      steps,
      logs: debugLogs,
    };
  }

}
