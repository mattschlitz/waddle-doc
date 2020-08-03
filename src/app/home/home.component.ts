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

  createFile(algo: 'LOGIC'|'CPU'|'FILE' = 'LOGIC'){
    this.building = true;
    this.success = null;
    this.error = this.pageRows.reduce(
      (err, pageRow, i) => err 
        || (!(pageRow.fileRow && pageRow.fileRow.file) && {token: 'ERROR.PAGE_SPEC.FILE_REQUIRED', values: {spec: i + 1}})
        || (!this.isRangeValid(pageRow.range) && {token: 'ERROR.PAGE_SPEC.INVALID_RANGE', values: {spec: i + 1}}),
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

        // console.log(`RUNNING ${algo}-HEAVY ALGO`);

        switch(algo){
          case 'CPU': this.cpuHeavyAlgo(filePath); break;
          case 'FILE': this.fileHeavyAlgo(filePath); break;
          case 'LOGIC': this.logicHeavyAlgo(filePath); break;
        }
      }
    ).finally(() => {
      this.building = false;
    }); 
       
  }

  private cpuHeavyAlgo(finalFile: string){
    let rotateFile, concatFile;
    let start = Date.now();
    try {
      rotateFile = this.pageRows.some((({rotation}) => rotation !== 'NONE')) 
        ? tmp.fileSync({postfix: '.pdf'}) 
        : null;
      concatFile = this.pageRows.length > 1 
        ? tmp.fileSync({postfix: '.pdf'}) 
        : null;
    } catch(e){
      // TODO: Add error to translation
      this.error = {token: 'ERROR.PDF_CREATION.TMP_FILE_ACCESS', values: {details: e}};
      rotateFile && rotateFile.removeCallback();
      concatFile && concatFile.removeCallback();
      return;
    }

    try {
      this.pageRows.forEach(({rotation, fileRow: {file: nextPdf}, range}, i, {length: numPages}) => {
        range = this.normalizeRange(range);
        if (rotation !== 'NONE') {
          const command = `qpdf --empty --pages ${nextPdf} ${range} -- --rotate=+${rotation} ${rotateFile.name}`;
          // console.log("ROTATE CMD:", command);
          this.electronService.childProcess.execSync(command);
          nextPdf = rotateFile.name;
          range = '1-z';
        }
        // const inputFile = i ? finalFile : '--empty';
        const inputFile = i ? concatFile.name : '--empty';
        const inputPages = i ? ' . 1-z' : '';
        // const outputFile = i ? '--replace-input' : finalFile;
        const outputFile = i === numPages - 1 ? finalFile : (i ? '--replace-input' : concatFile.name);
        const optimize = i === numPages - 1 && this.compress ? ' --optimize-images' : '';
        const command = `qpdf ${inputFile}${optimize} --pages${inputPages} ${nextPdf} ${range} -- ${outputFile}`;
        // console.log("CONCAT CMD:", command);
        this.electronService.childProcess.execSync(command);
      });
      // console.log('TOTAL TIME:', Date.now() - start);
      this.success = {token: "SUCCESS.PDF_CREATION", values: {}};
    } finally {
      rotateFile && rotateFile.removeCallback();
      concatFile && concatFile.removeCallback();
    }
  }

  private fileHeavyAlgo(filePath) {
    let start = Date.now();
    let rotatedFiles;
    const tmpfiles = [];

    try {
      // CREATE TEMPORARY ROTATED FILES
      rotatedFiles = this.pageRows
        .filter(pageRow => pageRow.rotation !== 'NONE')
        .reduce((acc, {rotation, fileRow: {file}}) => {
          const key = rotation + '_' + file;
          if (!acc[key]) {
            const tmpfile = tmp.fileSync({postfix: '.pdf'});
            tmpfiles.push(tmpfile);
            const command = `qpdf ${file} ${tmpfile.name} --rotate=+${rotation}`;
            // console.log("ROTATE CMD:", command);
            this.electronService.childProcess.execSync(command);
            acc[key] = tmpfile.name;
          }
          return acc;
        }, {});
    } catch(e) {
      this.error = {token: 'ERROR.PDF_CREATION.TMP_FILE_ACCESS', values: {details: e}};
      tmpfiles.forEach(tmpfile => tmpfile.removeCallback());
      return;
    }

    // CONCATENATE IT ALL TOGETHER
    try {
      const pageOptions = this.pageRows.reduce(
        (acc, pageRow) => {
          const filename = pageRow.rotation === 'NONE' 
            ? pageRow.fileRow.file 
            : rotatedFiles[pageRow.rotation + '_' + pageRow.fileRow.file];
          
          return acc + ' ' + filename + ' ' + this.normalizeRange(pageRow.range);
        }, ""
      );

      const command = `qpdf --empty${this.compress ? ' --optimize-images' : ''} --pages${pageOptions} -- ${filePath}`;
      // console.log("CONCAT CMD:", command);
      this.electronService.childProcess.execSync(command);
      // console.log('TOTAL TIME:', Date.now() - start);
      this.success = {token: "SUCCESS.PDF_CREATION", values: {}};
    } catch (e) {
      this.error = {token: 'ERROR.PDF_CREATION.GENERIC', values: {details: e}};
    } finally {
      tmpfiles.forEach(tmpfile => tmpfile.removeCallback());
    }
  }

  private logicHeavyAlgo(filePath) {
    let start = Date.now();
    const tmpfiles = [];
    const pageCountCache = {};
    const pageRows = this.pageRows.slice();

    try {
      // BUCKET PAGE ROWS BY ROTATION
      const rotationBuckets = pageRows.reduce((buckets, pageRow, i) => {
        if(pageRow.rotation !== 'NONE'){
          const bucket = buckets[pageRow.rotation] || {numPages: 0, pageRows: []};

          const range = this.normalizeRange(pageRow.range);
          const numPages = this.numberOfPagesInRange(range, pageRow.fileRow.file, pageCountCache);
          const pageStart = bucket.numPages + 1;
          bucket.pageRows.push({
            mappedRange: pageStart + (numPages > 1 ? `-${pageStart + numPages - 1}` : ''),
            originalRange: range,
            file: pageRow.fileRow.file,
            index: i
          });
          bucket.numPages += numPages;
          buckets[pageRow.rotation] = bucket;
        }
        return buckets;
      }, {});

      // CREATE TEMPORARY FILES FOR ALL ROTATIONS
      Object.keys(rotationBuckets).forEach((rotation) => {
        const tmpfile = tmp.fileSync({postfix: '.pdf'});
        tmpfiles.push(tmpfile);

        const pageOptions = rotationBuckets[rotation].pageRows.reduce(
          (acc, rotatedRow) => {
            pageRows[rotatedRow.index] = {
              rotation: 'NONE',
              range: rotatedRow.mappedRange,
              fileRow: {
                alias: '',
                file: tmpfile.name
              }
            };
            return `${acc} ${rotatedRow.file} ${rotatedRow.originalRange}`;
          }, ''
        );

        const command = `qpdf --empty --pages${pageOptions} -- --rotate=+${rotation} ${tmpfile.name}`;
        // console.log("ROTATE CMD:", command);
        this.electronService.childProcess.execSync(command);
      });
    } catch(e) {
      this.error = {token: 'ERROR.PDF_CREATION.TMP_FILE_ACCESS', values: {details: e}};
      tmpfiles.forEach(tmpfile => tmpfile.removeCallback());
      return;
    }

    // CONCATENATE IT ALL TOGETHER
    try {
      const pageOptions = pageRows.reduce(
        (acc, pageRow) => acc + ' ' + pageRow.fileRow.file + ' ' + this.normalizeRange(pageRow.range), ""
      );

      const command = `qpdf --empty${this.compress ? ' --optimize-images' : ''} --pages${pageOptions} -- ${filePath}`;
      // console.log("CONCAT CMD:", command);
      this.electronService.childProcess.execSync(command);
      // console.log('TOTAL TIME:', Date.now() - start);
      this.success = {token: "SUCCESS.PDF_CREATION", values: {}};
    } catch (e) {
      this.error = {token: 'ERROR.PDF_CREATION.GENERIC', values: {details: e}};
    } finally {
      tmpfiles.forEach(tmpfile => tmpfile.removeCallback());
    }
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

  private numberOfPagesInRange(range: string, file: string, pageCountCache: {[key: string]: string}) {
    // We are assuming that this is a valid range
    return range
      .split(',')
      .map(subrangeStr => {
        const subrange = subrangeStr.split('-');
        if (subrange.length === 1) {
          return 1;
        }
        if (subrange[1] === 'z') {
          if (!pageCountCache[file]) {
            pageCountCache[file] = this.electronService.childProcess.execSync('qpdf --show-npages ' + file, {encoding: 'ascii'});
          }
          subrange[1] = pageCountCache[file];
        }
        return Math.abs(parseInt(subrange[1], 10) - parseInt(subrange[0], 10)) + 1;
      })
      .reduce((sum, next) => sum + next, 0);
  }

}
