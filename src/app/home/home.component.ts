import { Component, OnInit } from '@angular/core';
import tmp from 'tmp';
import path from 'path';
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
  error: Translatable = null;

  constructor(public electronService: ElectronService) { }

  ngOnInit(): void { 
    this.resetForm();
  }

  changeFile(fileRow: FileRow, filename: string){
    fileRow.file = filename;
    if (filename && !fileRow.alias) {
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

  createFile(){
    // console.log('LOGGING!!!', this.fileRows, this.pageRows);

    // TODO: VALIDATION!
    this.error = this.pageRows.reduce(
      (err, pageRow, i) => err 
        || (!(pageRow.fileRow && pageRow.fileRow.file) && {token: 'ERROR.PAGE_SPEC.FILE_REQUIRED', values: {spec: i + 1}})
        || (!this.isRangeValid(pageRow.range) && {token: 'ERROR.PAGE_SPEC.INVALID_RANGE', values: {spec: i + 1}}),
      null as Translatable
    );

    if (this.error) {
      return;
    }

    this.electronService.remote.dialog.showSaveDialog(
      {filters: [{extensions: ['pdf'], name: 'Pdf File'}]}
    ).then(
      ({filePath}) => {

        if(!filePath){
          return;
        }

        const tmpfiles = [];
        try {
    
          // CREATE TEMPORARY ROTATED FILES
          const rotatedFiles = this.pageRows
            .filter(pageRow => pageRow.rotation !== 'NONE')
            .reduce((acc, {rotation, fileRow: {file}}) => {
              const key = rotation + '_' + file;
              if (!acc[key]) {
                const tmpfile = tmp.fileSync({postfix: '.pdf'});
                tmpfiles.push(tmpfile);
                const command = `qpdf ${file} ${tmpfile.name} --rotate=+${rotation}`;
                // console.log("ROTATE:", command);
                this.electronService.childProcess.execSync(command);
                acc[key] = tmpfile.name;
              }
              return acc;
            }, {});
          
          const pageOptions = this.pageRows.reduce(
            (acc, pageRow) => {
              const filename = pageRow.rotation === 'NONE' 
                ? pageRow.fileRow.file 
                : rotatedFiles[pageRow.rotation + '_' + pageRow.fileRow.file];
              
              return acc + ' ' + filename + ' ' + this.normalizeRange(pageRow.range);
            }, ""
          );
    
          const command = `qpdf --empty${this.compress ? ' --optimize-images' : ''} --pages${pageOptions} -- ${filePath}`;
          // console.log("BUILD:", command);
          this.electronService.childProcess.execSync(command);
        } catch (e) {
          this.error = {token: 'ERROR.PDF_CREATION.GENERIC', values: {details: e}};
        } finally {
          tmpfiles.forEach(tmpfile => tmpfile.removeCallback());
        }
      }
    );    
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
      .replace('+', '-z')
      .replace(/^$/, '1-z')
  }

}
