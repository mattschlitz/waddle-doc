import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TranslateModule } from '@ngx-translate/core';

// Angular Material
import {MatFormFieldModule} from '@angular/material/form-field'; 
import {MatInputModule} from '@angular/material/input'; 
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatCheckboxModule} from '@angular/material/checkbox'; 
import {MatIconModule} from '@angular/material/icon'; 
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner'; 
import {MatTooltipModule} from '@angular/material/tooltip';

import { PageNotFoundComponent } from './components/';
import { WebviewDirective } from './directives/';
import { FormsModule } from '@angular/forms';

@NgModule({
  declarations: [PageNotFoundComponent, WebviewDirective],
  imports: [
    CommonModule, TranslateModule, FormsModule, 
    
    MatFormFieldModule, MatSelectModule, MatButtonModule, MatCheckboxModule, MatInputModule, MatIconModule,
    MatProgressSpinnerModule, MatTooltipModule
  ],
  exports: [
    TranslateModule, WebviewDirective, FormsModule, 
    
    MatFormFieldModule, MatSelectModule, MatButtonModule, MatCheckboxModule, MatInputModule, MatIconModule,
    MatProgressSpinnerModule, MatTooltipModule
  ]
})
export class SharedModule {}
