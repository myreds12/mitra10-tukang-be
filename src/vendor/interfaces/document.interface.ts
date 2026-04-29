// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface Document {
  file: Express.Multer.File;
  document_type:
    | 'ktp'
    | 'npwp'
    | 'compro'
    | 'surat_permohonan'
    | 'pks'
    | 'siup'
    | 'other';
}
