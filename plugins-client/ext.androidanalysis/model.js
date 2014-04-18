
define(function(require, exports, module) {
    var ext = require("core/ext");
    var ide = require("core/ide");
    var util = require("core/util");
    var editors = require("ext/editors/editors");
    var fs = require("ext/filesystem/filesystem");
    var Range = require("ace/range").Range;
    var Selection = require("ace/selection").Selection;
    var Document = require("ace/document").Document;
    var menus = require("ext/menus/menus");
    var dock = require("ext/dockpanel/dockpanel");
    var commands = require("ext/commands/commands");
    var myutils = require("./myutils");

    var prettyPrint = require("./google-code-prettify/prettify_module").prettyPrint;
    var prettifyCss = require("text!./google-code-prettify/sonofobsidian.css");
    
    function SubAnnotation(props) {
      
      if(props.method) this.method = props.method;
      else if(props.value)  this.value  = props.value;
      
      if(props.class_name) {
         /* the fully-qualified name of the class */
         this.class_name  = props.class_name;
         /* the name of the class without pkg prefix */
         this.unqualified_class_name = props.class_name.split('.').pop();
      }

      this.description = props.description;
      
      /* this.info is a flexible descriptive field */
      if (props.method) {
        this.info = '(' + (props.description || 'other') + ') ' + 
                    (this.unqualified_class_name ?  this.unqualified_class_name + '.' : '') + props.method;
      } else if(props.value) {
        this.info = props.value;
      } else {
        this.info = props.description;
      }
      
      this.risk_score = props.risk_score;
      this.start_line = props.start_line;
      this.end_line   = props.end_line;
      this.start_col  = props.start_col;
      this.end_col    = props.end_col;
    }

    SubAnnotation.prototype.toString = function () {
       return (this.description ? this.description + ' - ' : '') + 
              (this.unqualified_class_name ? (this.unqualified_class_name + 
                (this.method ? '.' + this.method : '')) : (this.method ? this.method : '')) + 
              (this.risk_score ? ' (risk: ' + this.risk_score + ')' : ''); 
    }

    SubAnnotation.prototype.toXml = function () {
        return util.toXmlTag("subannotation", {
            description: this.info,
            start_line:  this.start_line,
            start_col:   this.start_col,
            risk_score:  this.risk_score
        }, false /*include self-closing slash*/);
    }
    
    SubAnnotation.prototype.getRangeInDocument = function (doc) {
        //TODO: sub annotations need to be more specific about what they are 
        //      (callsite, method def, variable, literal, code section, etc...)
        var range;
        
        // if the exact highlight position is specified, just highlight the range
        if(this.start_col && this.end_line && this.end_col) {
            range = new Range(this.start_line-1, this.start_col-1, this.end_line-1, this.end_col-1);
        } 
        // if a method is specified, then highlight as a call site
        else if (this.method) {
            var sanStartLine = this.start_line - 1;
            var sanMethod = (this.method == '<init>') ? 
                this.class_name.split(/[$.]/).pop() :
                this.method;
            // assuming it is a call site... but what if the sub annotation is a method def?
            var pattern    = '(?:.\\s*)?('+sanMethod+')\\s*\\(';
            var firstMatch = new RegExp(pattern, 'm').exec(doc.getLine(sanStartLine));
            var capturedGroup = firstMatch[1];
            var groupIndex = firstMatch.index + firstMatch[0].indexOf(capturedGroup);
            if(firstMatch) {
                range = new Range(sanStartLine, groupIndex,
                                  sanStartLine, groupIndex + capturedGroup.length - 1)
            }
        } 
        // if a literal value is specified, then find the literal value in the text
        else if(this.value) {
            //TODO do a regex on the value
            console.warn('subannotation value property highlight unimplemented.');
        }
        return range;
    }

    function Annotation(props) {
      
      if(props.method) this.method = props.method;
      else if(props.value)  this.value  = props.value;
      
      this.file_name = props.file_name;
      
      this.path = props.path;
      
      this.annotation_index = props.annotation_index;
      
      this.cloud9_path = props.cloud9_path;
      
      /* the fully-qualified name of the class */
      this.class_name = props.class_name;
      
      /* TODO instantiate the sub annotations? */ 
      this.sub_annotations = props.sub_annotations || [];
      
      /* the name of the class without pkg prefix */
      this.unqualified_class_name = props.unqualified_class_name;
      
      this.short_description = props.short_description;
      this.long_description  = props.long_description;
      
      /* this.info is a flexible descriptive field */
      if (props.method) {
        this.info = this.unqualified_class_name + '.' + props.method;
      } else if(props.value) {
        this.info = props.value;
      } else {
        this.info = props.long_description || props.short_description;
      }
      
      this.risk_score = props.risk_score;
      this.start_line = props.start_line;
      this.end_line   = props.end_line;
      this.start_col  = props.start_col;
      this.end_col    = props.end_col;
    }

    Annotation.prototype.toString = function () {
       return this.path + ':' + this.start_line + '\n' +
              (this.short_description ? this.short_description + '\n' : '') + 
              (this.long_description ? this.long_description  + '\n' : '') +
              (this.unqualified_class_name || '') + '.' + (this.method || '') + ' ' +
              (this.risk_score ? '(risk: ' + this.risk_score + ')' : ''); 
    }
    
    Annotation.prototype.toXml = function () {
        var aXml = util.toXmlTag("annotation", {
            description: this.info,
            start_line:  this.start_line,
            start_col:   this.start_col,
            risk_score:  this.risk_score,
            annotation_index: this.annotation_index
        }, true /*exclude self-closing slash*/);
        var subsXml = ' <subannotations>';
        if(this.sub_annotations) {
          for(var i = 0; i < this.sub_annotations.length; i++) {
            subsXml += this.sub_annotations[i].toXml();
          }
        }
        return aXml + subsXml + '</subannotations></annotation>';
    }
    
    Annotation.prototype.getRangeInDocument = function (doc) {
        var range;
        if(this.start_col && this.end_line && this.end_col) {
            range = new Range(this.start_line-1, this.start_col-1, this.end_line-1, this.end_col-1);
        } else if (this.method) {
            // find method name in document by simple string compare
            // the problem is that method defs do not have line numbers in dex file, so 
            // need to look upward from the specified line number (which is the first instruction in body)
            var firstInstrStartLine = this.start_line - 1;
            var startLine = firstInstrStartLine;
            var startCol  = this.start_col;
            var searchText = (this.method != '<init>') ? this.method : this.unqualified_class_name.split('$').pop();

            while((startCol = doc.getLine(startLine).indexOf(searchText)) == -1) { 
                if(--startLine < 0) break; 
            }
            range = new Range(startLine, startCol, startLine, (startCol + Math.max(0,searchText.length-1)));
        } else if (this.value) {
            //TODO do a regex on the value
            console.warn('annotation value property highlight unimplemented.');
        }
        return range;
    }
    
    function RiskReport(path, annotations) {
        
        this.annotations = [];

        /* by the following folder convention
         * build the path to the source code based on the risk report filepath
         *
         * apps/ <- the cloud9 'workspace' directory (server root)
         *   AppName/
         *     project/
         *       src/
         *       AppName.apk   
         *     reports/
         *       my_risk_report.json
         */  
        
        if(path) {
            /* the cloud9 path to the risk report file */
            this.path = path;
            
            var _path = path.split('/');

            _path.pop(); // remove filename
            _path.pop(); // remove reports dir
            
            this.app_name  = _path.pop();
            
            //expected folder structure convention for source
            this.src_path = _path.join('/') + '/' + this.app_name +  '/project/src/'; 
            
            for(var i = 0; i < annotations.length; i++) {
                var an = annotations[i];
                // hand created risk reports may not have class names and method names
                // TODO find the classname and method name automatically when it is added to a risk report
                if(!an.cloud9_path) {
                    // adding post processed properties in order to
                    // make the grid easier to read and the file lookup easier
                    var javaPkg = an.class_name.split('.');
                    
                    an.unqualified_class_name = javaPkg.pop();
                    
                    var relativePath = javaPkg.join('/');
                    
                    an.annotation_index = i;
                    an.path = relativePath + '/' + an.file_name;
                    an.cloud9_path = this.src_path + an.path;
                }
                var sans = [];
                for(var j = 0; j < an.sub_annotations.length; j++) {
                    sans.push(new SubAnnotation(an.sub_annotations[j]))
                }
                an.sub_annotations = sans;
                this.annotations.push(new Annotation(an)) 
            }
        }
    }

    // model requires xml format :(
    // flatten makes sub annotations siblings of annotations
    RiskReport.prototype.toXml = function () {
      var xml = '';
      for(var i = 0; i < this.annotations.length; i++) {
          xml +=  this.annotations[i].toXml();
      }
      return xml;
    }

    RiskReport.prototype.toPlainText = function (callback) {
        var _self = this,
            contents = 'Risk Report: ' + (this.app_name ? this.app_name: '<Application Name>') + '\n', 
            anotPrefix  = '\n***************************************************************************************\n',
            anotTrailer = '\n***************************************************************************************',
            sanPrefix   = '\n',
            sanTrailer  = '',
            codePrefix  = '\n_______________________________________________________________________________________\n',
            codeTrailer = '\n_______________________________________________________________________________________\n',
            linesBefore = 2,
            linesAfter  = 1,
            startCol    = 0,
            endCol      = 100,
            footer = '\n';

        function getMinColumnsToTrim(strArr) {
            var trim_cnt;
            for(var i = 0; i < strArr.length; i++) {
                var matches = strArr[i].match(/^\s+/)
                if(!matches) return 0;
                if(trim_cnt == null || matches[0].length < trim_cnt)
                     trim_cnt = matches[0].length;
            }
            return trim_cnt;
        }
        
        
        function renderNextAnnotation(index) {
            if(index == _self.annotations.length) {
                contents += footer;
                callback(contents);
            } else {
                var anot = _self.annotations[index];
                contents +=  anotPrefix + anot.path + 
                    (anot.unqualified_class_name ? ' ' + anot.unqualified_class_name : '') + 
                    (anot.method ? '.' + anot.method : '') + anotTrailer + (anot.long_description ? '\n' + anot.long_description : '');
                myutils.getDocument(anot.cloud9_path, function (doc, err) {
                    var lastLn = doc.getLength()-1
                    var anotRange    = anot.getRangeInDocument(doc);
                    var anotStartLn  = Math.max(0,      anotRange.start.row-linesBefore);
                    var anotEndLn    = Math.min(lastLn, anotRange.end.row+linesAfter);
                    var anotCodeLns  = doc.getLines(anotStartLn, anotEndLn);
                    
                    // remove prefixed whitespace as much as possible with ruining indentation
                    var trim_cnt = getMinColumnsToTrim(anotCodeLns);

                    // prepend line nums
                    for(var i = 0; i < anotCodeLns.length; i++) {
                      anotCodeLns[i] = '' + (i + anotStartLn) + ':' +  anotCodeLns[i].substring(Math.max(0,trim_cnt-1));
                    }
                    
                    contents +=  codePrefix + anotCodeLns.join('\n') + codeTrailer;

                    for(var i =0; i < anot.sub_annotations.length; i++) {
                        var san = anot.sub_annotations[i];
                        contents += sanPrefix + san.toString() + sanTrailer;
                        var sanStartLn  = Math.max(0,      san.start_line-linesBefore);
                        var sanEndLn    = Math.min(lastLn, san.start_line+linesAfter);
                        var sanRange    = new Range(sanStartLn, startCol, sanEndLn, endCol)
                        var sanCodeLns = doc.getLines(sanStartLn, sanEndLn);
                        
                        // remove prefixed whitespace as much as possible with ruining indentation
                        trim_cnt = getMinColumnsToTrim(sanCodeLns);
                        
                        // prepend line nums
                        for(var j = 0; j < sanCodeLns.length; j++) {
                          sanCodeLns[j] = '' + (j + sanStartLn) +  ':' + sanCodeLns[j].substring(Math.max(0,trim_cnt-1));
                        }
                        
                        contents += codePrefix + sanCodeLns.join('\n') + codeTrailer;
                    }
                    
                    renderNextAnnotation(index+1);
                })
            } 
        }    
        renderNextAnnotation(0);
    }
 
    RiskReport.prototype.toHtml = function (callback) {
        var _self = this,
            contents = '<html><head><style>'+prettifyCss+'</style><h1>Risk Report</h1></head><body>', 
            anotPrefix  = '<p><b>',
            anotTrailer = '</b></p>',
            sanPrefix   = '<p>',
            sanTrailer  = '</p>',
            codePrefix  = '<pre class="prettyprint">',
            codeTrailer = '</pre>',
            linesBefore = 2,
            linesAfter  = 1,
            startCol    = 0,
            endCol      = 100,
            footer = '</body></html>';

        function renderNextAnnotation(index) {
            if(index == _self.annotations.length) {
                contents += footer;
                callback(contents);
            } else {
                var anot = _self.annotations[index];
                contents +=  anotPrefix + anot.toString() + anotTrailer;
                
                myutils.getDocument(anot.cloud9_path, function (doc, err) {
                    var anotStartLn  = Math.max(0, anot.start_line-linesBefore);
                    var anotRange    = new Range(anotStartLn, startCol, anot.start_line+linesAfter, endCol)
                    var anotCodeText = doc.getTextRange(anotRange);
                    contents +=  codePrefix + prettyPrint(anotCodeText, 'java', anotStartLn) + codeTrailer;

                    for(var i =0; i < anot.sub_annotations.length; i++) {
                        var san = anot.sub_annotations[i];
                        contents += sanPrefix + san.toString() + sanTrailer;
                        var sanStartLn  = Math.max(0, san.start_line-linesBefore);
                        var sanRange    = new Range(sanStartLn, startCol, san.start_line+linesAfter, endCol)
                        var sanCodeText = doc.getTextRange(sanRange);
                        contents += codePrefix + prettyPrint(sanCodeText, 'java', sanStartLn)  + codeTrailer;
                    }
                    renderNextAnnotation(index+1);
                })
            } 
        }    
        renderNextAnnotation(0);
    }
    
    exports.Annotation    = Annotation;
    exports.SubAnnotation = SubAnnotation;
    exports.RiskReport    = RiskReport;
})
