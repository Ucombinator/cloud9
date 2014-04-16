/**
 * Extension Template for Cloud9 IDE
 * 
 * Inserts a context menu item under the "Edit" menu, which, when
 * clicked, displays a simple window with a "Close" button.
 * 
 * This file is stripped of comments in order to provide a quick template for 
 * future extensions. Please reference our documentation for a list of what's
 * going on.
 *
 * @copyright 2012, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
 
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
var markup = require("text!ext/androidanalysis/RiskReportDockView.xml");
var css = require("text!ext/androidanalysis/style/analysis.css");
var prettyPrint = require("./google-code-prettify/prettify_module").prettyPrint;
var prettifyCss = require("text!./google-code-prettify/sonofobsidian.css");

module.exports = ext.register("ext/androidanalysis/risk", {
    name     : "Android Risk Analysis",
    dev      : "ucombinator",
    alone    : true,
    deps     : [],
    type     : ext.GENERAL,
    markup   : markup,
    nodes : [],
    init : function () {
        this.riskReportView = riskReportView;
        this.editAnnotationView = editAnnotationView;
        this.editSubAnnotationView = editSubAnnotationView;
        var _self = this;
        
        
        apf.addEventListener('rowClicked', function(e) {
           console.log(e.owner.getSelection());
           _self.clearPreviousHighlights();
           _self.jumpToAndHighlight((e.owner.id == 'subAnnotationsList'));              
        });

        apf.addListener(annotationsList, 'dragdrop', function (e) {
            var path;
            if(e.data.length > 0 && (path = e.data[0].getAttribute("path"))) {
                console.log('dropped file ' + path + ' on risk report grid'); 
                _self.openRiskReport(path);
            }
            // TODO: get rid of the fly back animation on the cancelled drop somehow
            return false; //cancel the drop to avoid messing up the dom
        });
        
        apf.addListener(subAnnotationsList, 'keydown', function(e) {
            var pressed = e.htmlEvent.keyIdentifier;
            if(pressed == 'Down' || pressed == 'Up') {
              _self.clearPreviousHighlights();
              _self.jumpToAndHighlight(true);
            } else if (pressed == 'Left' || pressed == 'Right') {
              annotationsList.focus();
            }
        })
        
        apf.addListener(subAnnotationsList, 'focus', function(e) {
            _self.jumpToAndHighlight(true);
        })
        
        apf.addListener(annotationsList, 'focus', function(e) {
            _self.jumpToAndHighlight();
        })
        
        apf.addListener(annotationsList, 'keydown', function (e) {
            var pressed = e.htmlEvent.keyIdentifier;
            if(pressed == 'Down' || pressed == 'Up') {
              _self.clearPreviousHighlights();
              _self.jumpToAndHighlight();
            } else if (pressed == 'Left' || pressed == 'Right') {
              subAnnotationsList.focus();
            }
        });
        
        commands.addCommand({
            name: "createRiskReport",
            hint: "Create an Android Risk Report",
            msg: "Start a blank report",
            bindKey: {mac: "Command-Shift-R", win: "Ctrl-Shift-R"},
            isAvailable : function() {
                return true;    
            },
            exec: function() {
                console.log(dock);
                _self.riskReport = { annotations: [] };
                _self.loadRiskReportModel(_self.riskReport);   
            }
        });

        var command = commands.addCommand({
            name: "addRiskAnnotation",
            hint: "add higlighted text to android risk report",
            bindKey: {mac: "Command-Shift-A", win: "Ctrl-Shift-A"},
            isAvailable : function(editor) {
                return editor && editor.amlEditor && _self.riskReport;
            },
            exec: function(editor) {
                var range = editor.getSelection().getRange();
                var annotation = _self.orientRange(range);
                annotation.sub_annotations = [];
                annotation.cloud9_path = 
                    editor.amlEditor.$editor.session.c9doc
                    .getNode().getAttribute('path');
                _self.$pendingAnnotation = annotation;
                anotRiskDescription.clear();
                _self.editAnnotationView.show();
           }
        });

        var command = commands.addCommand({
            name: "addSubAnnotation",
            hint: "add higlighted text as subannotation of selected annotation in android risk report",
            bindKey: {mac: "Command-Shift-S", win: "Ctrl-Shift-S"},
            isAvailable : function(editor) {
                return editor && editor.amlEditor && _self.riskReport && annotationsList.getSelection().length > 0;
            },
            exec: function(editor) {
                var range = editor.getSelection().getRange();
                var annotation = _self.orientRange(range)
                annotation.cloud9_path = 
                    editor.amlEditor.$editor.session.c9doc
                    .getNode().getAttribute('path');
                _self.$pendingSubAnnotation = annotation;
                
                //TODO is there a clean way to reinit the whole window?
                sanRiskDescription.clear();
                _self.editSubAnnotationView.show();
           }
        });

        // right click context item in ace
        ide.addEventListener("init.ext/code/code", function() {
            _self.nodes.push(
                mnuCtxEditor.insertBefore(new apf.item({
                    id : "mnuCtxEditorAddRiskAnnotation",
                    caption : "Add to Risk Report",
                    command: "addRiskAnnotation"
                }), mnuCtxEditor.firstChild)
            );
            _self.nodes.push(
                mnuCtxEditor.insertBefore(new apf.item({
                    id : "mnuCtxEditorAddSubAnnotation",
                    caption : "Add to Risk Report (as sub annotation)",
                    command: "addSubAnnotation"
                }), mnuCtxEditor.firstChild)
            );
            
            
        });
    },
    // Orient the range by document start/end order (rather than cursor start/end order)
    // in order to simplify highlighting when risk report is clicked.
    // Increment values to make like android dex source info (1-indexed)
    orientRange: function (range) {
        if(range.start.row == range.end.row) {
          return {
            start_line: range.start.row + 1,
            start_col:  Math.min(range.start.column, range.end.column) + 1,
            end_line:   range.start.row + 1,
            end_col:    Math.max(range.start.column, range.end.column) + 1
          }
        } else if (range.start.row < range.end.row) {
          return {
            start_line: range.start.row + 1,
            start_col:  range.start.column + 1,
            end_line:   range.end.row + 1,
            end_col:    range.end.column + 1
          }
        } 
        return {
            start_line: range.end.row + 1,
            start_col:  range.end.column + 1,
            end_line:   range.start.row + 1,
            end_col:    range.start.column + 1
        }
    },
    hook : function(){
        var _self = this;
        var name =  "ext/androidanalysis/risk";
        var button = "Risk Report Viewer";
        
        apf.importCssString(css || "");

        dock.addDockable({
            expanded : -1,
            width : 400,
            noTab: true,
            //"min-width" : 400,
            //barNum: 2,
            //headerVisibility: "false",
            sections : [{
                width : 360,
                height: 300,
                buttons : [{
                    caption: "Android Risk Report",
                    ext : [name, button],
                    hidden : true
                }]
            }]
        });

        dock.register(name, button, {
            menu : "Android Risk Report",
            primary : {
                backgroundImage: ide.staticPrefix + "/ext/main/style/images/android_robot_icon.png",
                defaultState: { x: -11, y: -10 },
                activeState:  { x: -11, y: -46 }
            }
        }, function() {
            ext.initExtension(_self);
            
            _self.nodes.push(
                menus.addItemByPath("File/Open Android Risk Report", new apf.item({
                    command : "createRiskReport"
                }), 5400)
            ); 
            
            return riskReportView;
        });
    },
    enable : function(){
        this.nodes.each(function(item){
            item.enable();
        });
    },

    disable : function(){
        this.nodes.each(function(item){
            item.disable();
        });
    },

    destroy : function(){
        
        this.nodes.each(function(item){
            item.destroy(true, true);
        });
        this.nodes = [];
        
        //riskReportViewTab.destroy(true, true);
        this.$layoutItem.destroy(true, true);
    },
    transformRiskReport: function (json, path) {
      var _path = path.split('/');
      _path.pop(); // remove filename
      _path.pop(); // remove reports dir
      var workspacePath = _path.join('/') + '/project/src/'; //convention, should we do this?
      for(var i = 0; i < json.annotations.length; i++) {
        var an = json.annotations[i];
        if(!an.cloud9_path) {
            // adding post processed properties in order to
            // make the grid easier to read and the file lookup easier
            var javaPkg = an.class_name.split('.');
            an.unqualified_class_name = javaPkg.pop();
            var relativePath = javaPkg.join('/');
            an.annotation_index = i;
            an.cloud9_path = workspacePath + relativePath + '/' + an.file_name;
        }
        for(var j = 0; j < an.sub_annotations.length; j++) {
          var san = an.sub_annotations[j];
          if(san.class_name)
             san.unqualified_class_name = san.class_name.split('.').pop();
        }
      }
      return json;
    },
    onEditAnotDone: function () {
      this.$pendingAnnotation.long_description = anotRiskDescription.value;
      this.$pendingAnnotation.annotation_index = this.riskReport.annotations.length;
      this.riskReport.annotations.push(this.$pendingAnnotation);
      this.loadRiskReportModel(this.riskReport); 
      this.editAnnotationView.hide();
    }, 
    onEditSubAnotDone: function () {
      var selectedItems = annotationsList.getSelection();
      if(selectedItems.length > 0) {
          //TODO make sure the sub annotation is in the same file as the parent annotation,
          //     otherwise, they should be separate annotations
          var idx = parseInt(selectedItems[0].getAttribute('annotation_index'));
          var anot = this.riskReport.annotations[idx];
          this.$pendingSubAnnotation.description = sanRiskDescription.value;
          if(!anot.sub_annotations) anot.sub_annotations = [];
          anot.sub_annotations.push(this.$pendingSubAnnotation);
          this.loadRiskReportModel(this.riskReport); 
      } else {
          util.alert('Failed to add sub annotation', 
                     'No parent annotation selected.');
      }
      this.editSubAnnotationView.hide();
    },
    renderReport: function () {
      //TODO: render static html output and open in new browser window
      var _self = this;
      var fn = '/workspace/risk_report_preview.html';
      var contents = '<html><head><style>'+prettifyCss+'</style></head><body>' 

      function renderNextAnnotation(index) {
         if(index == _self.riskReport.annotations.length) {
            contents += '</body></html>';
            fs.saveFile(fn, contents, 
                function(value, state, extra) {
                    if (state !== apf.SUCCESS) {
                        return util.alert("Could not render document",
                            "An error occurred while saving the generated document",
                            "The server responded with status " + extra.status + ".");
                    }
                     
                    window.open(fn, "_blank");
                });
         } else {
              var anot = _self.riskReport.annotations[index];
              _self.getDocument(anot.cloud9_path, function (doc, err) {
                  contents += '<p><b>' + 
                    (anot.class_name || '') + ' ' + 
                    (anot.method || '') + 
                    (anot.long_description || '') + 
                    (anot.risk_score ? ' (risk: ' + anot.risk_score + ')' : '') + '</b></p>' +
                    '<pre class="prettyprint">' + 
                    prettyPrint(
                      doc.getTextRange(new Range(Math.max(0, anot.start_line-2), 0, anot.start_line+1, 70)), 
                      'java', Math.max(0, anot.start_line-2)
                    )  + '</pre>';
                  for(var i =0; i < anot.sub_annotations.length; i++) {
                      var san = anot.sub_annotations[i];
                      contents += '<p><b>' + (san.description || 'no description') + ':</b> ' +
                         (san.unqualified_class_name || '') + 
                         (san.method? '.' : '') + 
                         (san.method || '') + 
                         (san.risk_score ? ' (risk: ' + san.risk_score + ')' : '') + '</b></p>';
                      var textRange = doc.getTextRange(
                        new Range(Math.max(0, san.start_line-2), 0, san.start_line+1, 70)
                      );
                      contents += '<pre class="prettyprint">' + 
                        prettyPrint(textRange, 'java', Math.max(0, san.start_line-2))  + '</pre>';
                  }
                  renderNextAnnotation(index+1)
              })
            
         }
      
      }    
      renderNextAnnotation(0);
    },
    openRiskReport: function(path) {
        var _self = this;
        var baseUrl = apf.host;
        
        var http = new apf.http();
        http.getJSON(baseUrl + path, function(json, state, extra){
            if (state != apf.SUCCESS)
                return util.alert('Failed to load Risk Report', 
                  'Encountered: ' + extra.message, 
                  'verify the file is in the correct format.');
            _self.riskReport = _self.transformRiskReport(json, path);
            _self.loadRiskReportModel(_self.riskReport);
        });
    },
    getDocument: function(path, callback) {
        var _self = this;
        var baseUrl = apf.host;
        var http = new apf.http();
        http.get(baseUrl + path, { 
            callback: function(data, state, extra){
                if (state != apf.SUCCESS) {
                    callback(null, extra.message);
                }
                callback(new Document(data));            
            }
        });
    },
    toggleShowSinks:  function () {
       if(this.riskReport) {
          this.loadRiskReportModel(this.riskReport);
       }
    },
    loadRiskReportModel: function (riskReport) {
         if(riskReport) {
           var annotationsXml = this.riskReportAsXml(riskReport);
           annotationsList.getModel().load('<data>\n' + annotationsXml + '</data>');
         } else {
           annotationsList.getModel().load('');
         }
    },
    // model requires xml format :(
    // flatten makes sub annotations siblings of annotations
    riskReportAsXml: function (riskReport) {
      if(!riskReport || !riskReport.annotations) return;
      
      var xml = '';
      var annotations = riskReport.annotations;

      function annotationAsXml(an) {
        var aXml = util.toXmlTag("annotation", an, true /*exclude self-closing slash*/);
        var subsXml = ' <subannotations>\n';
        if(an.sub_annotations) {
          for(var i = 0; i < an.sub_annotations.length; i++) {
            subsXml += '   ' + subAnnotationAsXml(an.sub_annotations[i]) + '\n'
          }
        }
        return aXml + '\n' + subsXml +  ' </subannotations>\n</annotation>';
      }
      
      function subAnnotationAsXml(san) {
        var subAXml = util.toXmlTag("subannotation", san, false /*include self-closing slash*/);
         return subAXml;
      }
      
      for(var i = 0; i < annotations.length; i++) {
          xml +=  annotationAsXml(annotations[i]) + '\n';
      }
      return xml;
    },
    onSaveRiskReport: function () {
        fs.saveFile('/workspace/' + riskReportFilename.value, 
            JSON.stringify(this.riskReport, null, 2), 
            function(value, state, extra) {
                if (state !== apf.SUCCESS) {
                    return util.alert("Could not save document",
                        "An error occurred while saving this document",
                        "The server responded with status " + extra.status + ".");
                } else {
                  saveRiskReportDialog.hide();
                  util.alert('Saved Risk Report', 'Successfully saved risk report', riskReportFilename.value);
                }
            });
    },
    close: function() {
        this.riskReport = null;
        this.loadRiskReportModel();
        var currEditor = editors.currentEditor;

        if(currEditor) {
          var currSession = currEditor.amlEditor.getSession();
          this.removeMarkers(currSession);
        }
    },
    clearPreviousHighlights: function () {
    
    },
    removeMarkers: function(session) { 
        var markers = session.getMarkers(false); 
        for (var id in markers) 
            if (markers[id].clazz.indexOf('_annotation') != -1) 
                session.removeMarker(id); 
    },
    jumpToAndHighlight: function (sub) {
      var _self = this;
      
      var selectedSubItems = subAnnotationsList.getSelection();
      
      var selectedItems = annotationsList.getSelection();
      if(selectedItems.length > 0) {
        //update the subAnnotationList
        //TODO why does subAnnotationsList sometimes take a double click to update???
        //     can this datagrid be bound directly to the selected annotation?
        subAnnotationsList.setModel(selectedItems[0].childNodes[1] || '<subannotations></subannotations>')

        // the index property is injected into the xml model as a way
        // to lookup the item in the backing object
        var idx = parseInt(selectedItems[0].getAttribute('annotation_index'));
        var anot = this.riskReport.annotations[idx];
        var currEditor = editors.currentEditor;
  
        if(currEditor) {
          var currSession = currEditor.amlEditor.getSession();
          this.removeMarkers(currSession);
        }
        
        function drawHighlights() {
            ide.removeEventListener('changeAnnotation', drawHighlights);
            if(!editors.currentEditor) return;
            
            var editor  = editors.currentEditor.amlEditor.$editor;
            var session = editor.getSession();
            var doc = session.getDocument();
            
            editor.on('blur', function () {
              if(session) _self.removeMarkers(session);
            });
            
            // the language worker clears the annotations, so wait for it to do it's work,
            // then add our annotations over the top
            // (although this may not be a problem for read-only java files...)
            setTimeout(function () {
                
                var highlightRange;
                
                if(anot.start_col && anot.end_line && anot.end_col) {
                   highlightRange = new Range(anot.start_line-1, anot.start_col-1, anot.end_line-1, anot.end_col-1);
                } else if (anot.method) {
                    // find method name in document by simple string compare
                    // the problem is that method defs do not have line numbers in dex file, so 
                    // need to look upward from the specified line number (which is the first instruction in body)
                    var firstInstrStartLine = anot.start_line - 1;
                    var startLine = firstInstrStartLine;
                    var startCol  = anot.start_col;
                    var searchText = (anot.method != '<init>') ? anot.method : anot.unqualified_class_name.split('$').pop();
                    
                    while((startCol = doc.getLine(startLine).indexOf(searchText)) == -1) { 
                      if(--startLine < 0) break; 
                    }
                    highlightRange = new Range(startLine, startCol, startLine, (startCol + searchText.length));
                } else if (anot.value) {
                    //TODO do a regex on the value
                    console.warn('annotation value property highlight unimplemented.');
                }
   
                if(highlightRange) {
                    //markers: highlights source code
                    _self.markerId = session.addMarker(
                       highlightRange,
                       'risk_annotation', function(stringBuilder, range, left, top, viewport) {
                            var charWidth = viewport.characterWidth;
                            var width = (range.end.column - range.start.column) * charWidth;
                            stringBuilder.push(
                                "<div class='risk_annotation' style='",
                                "left:", left, "px;",
                                "top:", top, "px;",
                                "width:", width, "px;",
                                "height:", viewport.lineHeight, "px;' ", 
                                'onclick="console.log(\'why not print this?\')"',">", "</div>"
                            );
                        }, false);
                } else {
                  console.error('failed to highlight annotation' + anot);
                }
                
                for(var i = 0; i < anot.sub_annotations.length; i++) {
                   var san = anot.sub_annotations[i];
                   var sanHighlightRange;
                   if(san.start_col && san.end_line && san.end_col) {
                        sanHighlightRange = new Range(san.start_line-1, san.start_col-1, san.end_line-1, san.end_col-1);
                   } else if (san.method) {
                       var sanStartLine = san.start_line - 1;
                       var sanMethod = (san.method == '<init>') ? 
                         san.class_name.split(/[$.]/).pop() :
                         san.method;

                       var pattern    = '(.\\s*)?'+sanMethod+'\\s*\\(';
                       var firstMatch = new RegExp(pattern, 'm').exec(doc.getLine(sanStartLine));
                       if(firstMatch) {
                          sanHighlightRange = new Range(sanStartLine, firstMatch.index, 
                                  sanStartLine, firstMatch.index + firstMatch[0].length)
                       }
                   } else if(san.value) {
                     //TODO do a regex on the value
                     console.warn('subannotation value property highlight unimplemented.');
                   }
                   
                   if(sanHighlightRange) {  
                    _self.markerId = session.addMarker(
                        sanHighlightRange,
                        "sub_annotation", 
                        function(stringBuilder, range, left, top, viewport) {
                            var charWidth = viewport.characterWidth;
                            var width = (range.end.column - range.start.column) * charWidth;
                            stringBuilder.push(
                                "<div class='sub_annotation' style='",
                                "left:", left, "px;",
                                "top:", top, "px;",
                                "width:", width, "px;",
                                "height:", viewport.lineHeight, "px;'", ">", "</div>"
                            );
                        }, 
                        false); 
                   } else {
                     console.error('failed to highlight sub annotation' + san);
                   }                   
                }
            }, 50);
        }
          
        function onJumpToFileComplete(e) {
            ide.removeEventListener('jumpedToFile', onJumpToFileComplete);
            console.log(e);
            drawHighlights();
            if(sub) subAnnotationsList.focus() 
            else    annotationsList.focus();
        }
        
        ide.addEventListener('changeAnnotation', drawHighlights);
        ide.addEventListener('jumpedToFile', onJumpToFileComplete);

        this.jumpToFile({
          row: (sub && selectedSubItems.length > 0 ?  
            parseInt(selectedSubItems[0].getAttribute('start_line')): anot.start_line) -1,
          column: anot.start_col,
          path: anot.cloud9_path
        });
      } else {
        console.log('no risk annotation selected to jump to.');
      }
    },
    getFileNode: function (path) {
        var file;
        // does it have the required? '/workspace' prefix?
        if (path && path.substring(0, ide.davPrefix.length) == ide.davPrefix) {
            file = fs.model.queryNode("//file[@path=" + util.escapeXpathString(path) + "]")
                || fs.createFileNodeFromPath(path);
        }
        return file;
    }, 
    /**
    *  show file: (modified from ext.debugger/sources)
    *    options {path, row, column}
    */
    jumpToFile: function(options) {
        var row = options.row + 1;
        var column = options.column;
        var text = options.text || "" ;
        var path = options.path;
        var fileNode = this.getFileNode(path);
        
        if (fileNode) {
            editors.jump({
                node    : fileNode,
                row     : row,
                column  : column,
                text    : text,
                animate : true
            });
        }
    } 
     
});

});
