import { Component, OnInit } from '@angular/core';
import tmp from 'tmp';
import * as path from 'path';
import { ElectronService } from '../core/services';

interface FileRow {
  alias: string
  file: string
}

interface PageRow {
  fileRow: FileRow
  range: string
  rotation: 'NONE'|'90'|'180'|'270'
}

interface Translatable {
  token: string
  values: {[key: string]: string|number}
}

const ROTATION_TO_ARG_MAP = {NONE: '', 90: 'right', 180: 'down', 270: 'left'};


@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {

  rotationOptions: string[] = ['NONE', '90', '180', '270'];
  fileRows: FileRow[] = [];
  pageRows: PageRow[] = [];
  compress: boolean = true;

  building: boolean = false;
  error: Translatable = null;
  success: Translatable = null;

  constructor(public electronService: ElectronService) { }

  ngOnInit(): void { 
    this.resetForm();
  }

  changeFile(fileRow: FileRow, filename: string){
    fileRow.file = filename;
    if (filename && (!fileRow.alias || this.fileRows.length == 1)) {
      fileRow.alias = path.basename(filename, '.pdf');
    }
  }

  addFileRow(){
    this.fileRows.push({
      alias: '',
      file: ''
    });
  }

  addPageRow(){
    this.pageRows.push({
      fileRow: null,
      range: '',
      rotation: 'NONE'
    });
  }

  removeFileRow(fileRow){
    this.fileRows = this.fileRows.filter(o => o !== fileRow);
    this.pageRows.forEach(pageRow => {
      if (pageRow.fileRow === fileRow) {
        pageRow.fileRow = null;
      }
    });
    if(this.fileRows.length === 0){
      this.addFileRow();
    }
  }

  removePageRow(pageRow){
    this.pageRows = this.pageRows.filter(o => o !== pageRow);
    if(this.pageRows.length === 0){
      this.addPageRow();
    }
  }

  createFile(){
    this.building = true;
    this.success = null;
    const defaultFileRow = this.fileRows.length === 1 ? this.fileRows[0] : null;
    this.error = this.pageRows.reduce(
      (err, {fileRow, range}, i) => err 
        || (!((fileRow && fileRow.file) || (defaultFileRow && defaultFileRow.file)) && {token: 'ERROR.PAGE_SPEC.FILE_REQUIRED', values: {spec: i + 1}})
        || (!this.isRangeValid(range) && {token: 'ERROR.PAGE_SPEC.INVALID_RANGE', values: {spec: i + 1}}),
      null as Translatable
    );

    if (this.error) {
      this.building = false;
      return;
    }

    this.electronService.remote.dialog.showSaveDialog(
      {filters: [{extensions: ['pdf'], name: 'Pdf File'}]}
    ).then(
      ({filePath}) => {

        if(!filePath){
          return;
        }

        let nextAlpha = 'A';
        const fileToLetter = {};

        const pages = this.pageRows.map((pageRow, i) => {
          const file = (pageRow.fileRow || defaultFileRow).file;
          if (!fileToLetter[file]) {
            fileToLetter[file] = nextAlpha;
            nextAlpha= nextAlpha.replace(/(.)(Z*)$/, 
              (_, inc, zs) => (inc != 'Z' ? String.fromCharCode(inc.charCodeAt(0) + 1) : 'AA') + "A".repeat(zs.length));
          }

          return fileToLetter[file] 
            + this.normalizeRange(pageRow.range) 
            + ROTATION_TO_ARG_MAP[pageRow.rotation];
        });

        let concatFile, concatFileName;
        try {
          concatFile = this.compress
            ? tmp.fileSync({postfix: '.pdf'}) 
            : null;
          concatFileName = concatFile ? concatFile.name : filePath;
        } catch (e) {
          this.error = {token: 'ERROR.PDF_CREATION.TMP_FILE_ACCESS', values: {details: e}};
          concatFile && concatFile.removeCallback();
          return;
        }

        try {
          this.execCommand("pdftk", [
            ...Object.entries(fileToLetter).map(([file, letter]) => `${letter}=${file}`),
            'cat',
            ...pages,
            'output',
            concatFileName
          ]);

          if (this.compress) {
            this.execCommand("gs", [
              "-sDEVICE=pdfwrite", 
              "-dCompatibilityLevel=1.4", 
              "-dPDFSETTINGS=/screen", 
              "-dNOPAUSE",
              "-dAutoRotatePages=/None",
              "-dBATCH", 
              "-dQUIET", 
              "-sOutputFile=" + filePath,
              concatFileName
            ]);
          }
          this.success = {token: "SUCCESS.PDF_CREATION", values: {filePath}};
        } finally {
          concatFile && concatFile.removeCallback();
        }
      }
    )
    .catch(
      err => this.error = this.error || {token: 'ERROR.PDF_CREATION.GENERIC', values: {details: err}}
    )
    .finally(() => {
      this.building = false;
    }); 
       
  }

  resetForm(){
    this.fileRows = [];
    this.pageRows = [];
    this.compress = true;
    this.addFileRow();
    this.addPageRow();
  }

  private isRangeValid(range: string){
    return range
      .split(',')
      .every(subrange => subrange.match(/^\s*(?:\d+\s*(?:-\s*\d+|\+)?\s*)?$/));
  }

  private normalizeRange(range: string) {
    // We are assuming that this is a valid range
    return range
      .replace(/\s/g, '')
      .replace('+', '-end')
  }

  private execCommand(command, args){
    console.log('RUNNING COMMAND: ' + command + ' ' + args.join(' '));
    const result = this.electronService.childProcess.spawnSync(command, args);
  
    if (result.error || result.status !== 0) {
      throw result.error || result.stdout;
    }
  }

}
