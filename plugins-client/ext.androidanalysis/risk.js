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
var myutils = require("./myutils");
var model = require("./model");
var SubAnnotation = model.SubAnnotation;
var Annotation = model.Annotation;
var RiskReport = model.RiskReport;

module.exports = ext.register("ext/androidanalysis/risk", {
    name     : "Android Risk Analysis",
    dev      : "ucombinator",
    alone    : true,
    deps     : [],
    type     : ext.GENERAL,
    markup   : markup,
    pageTitle: "Risk Report",
    pageID   : "pgRiskReportBelow",
    nodes : [],
    init : function () {
    
        String.prototype.endsWith = function(suffix) {
            return this.indexOf(suffix, this.length - suffix.length) !== -1;
        };
        
        this.riskReportView = riskReportView;
        this.editAnnotationView = editAnnotationView;
        this.editSubAnnotationView = editSubAnnotationView;
        var _self = this;
        
        // make the standard source files read only
        ide.addEventListener("openfile", function(e) {
            var editor = e.editor.amlEditor.$editor;
            if(e.page.name.endsWith('.xml') || e.page.name.endsWith('.java')) {
                editor.setReadOnly(true);
            }
        })
        
        
        apf.addEventListener('rowClicked', function(e) {
            if(e.owner.id == 'subAnnotationsList' || e.owner.id == 'annotationsList') {
                _self.clearPreviousHighlights();
                _self.jumpToAndHighlight((e.owner.id == 'subAnnotationsList'), 
                    annotationsList, subAnnotationsList, _self.riskReport);  
                return false;
            }            
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
              _self.jumpToAndHighlight(true, 
                annotationsList, subAnnotationsList, _self.riskReport);  
            } else if (pressed == 'Left' || pressed == 'Right') {
              annotationsList.focus();
            }
        })
        
        apf.addListener(subAnnotationsList, 'focus', function(e) {
            _self.jumpToAndHighlight(true, 
                annotationsList, subAnnotationsList, _self.riskReport);  
        })
        
        apf.addListener(annotationsList, 'focus', function(e) {
            _self.jumpToAndHighlight(false, 
                annotationsList, subAnnotationsList, _self.riskReport);  
        })
        
        apf.addListener(annotationsList, 'keydown', function (e) {
            var pressed = e.htmlEvent.keyIdentifier;
            if(pressed == 'Down' || pressed == 'Up') {
              _self.clearPreviousHighlights();
              _self.jumpToAndHighlight(false, 
                annotationsList, subAnnotationsList, _self.riskReport);  
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
                _self.makeEditableRiskReportPanel();
                _self.editableRiskReport = new RiskReport();
                _self.loadEditableRiskReportModel(_self.editableRiskReport);   
            }
        });


        var command = commands.addCommand({
            name: "addSubAnnotation",
            hint: "add higlighted text as subannotation of selected annotation in android risk report",
            bindKey: {mac: "Command-Shift-S", win: "Ctrl-Shift-S"},
            isAvailable : function(editor) {
                return editor && editor.amlEditor && _self.editableRiskReport && editableAnnotationsList.getSelection().length > 0;
            },
            exec: function(editor) {
                var range = editor.getSelection().getRange();
                var annotation = myutils.orientRange(range)
                annotation.cloud9_path = 
                    editor.amlEditor.$editor.session.c9doc
                    .getNode().getAttribute('path');
                _self.$pendingSubAnnotation = annotation;
                
                //TODO is there a clean way to reinit the whole window?
                sanRiskDescription.clear();
                _self.editSubAnnotationView.show();
           }
        });

        var command = commands.addCommand({
            name: "addRiskAnnotation",
            hint: "add higlighted text to android risk report",
            bindKey: {mac: "Command-Shift-A", win: "Ctrl-Shift-A"},
            isAvailable : function(editor) {
                return editor && editor.amlEditor && _self.editableRiskReport;
            },
            exec: function(editor) {
                var range = editor.getSelection().getRange();
                var annotation = myutils.orientRange(range);
                annotation.sub_annotations = [];
                annotation.cloud9_path = 
                    editor.amlEditor.$editor.session.c9doc
                    .getNode().getAttribute('path');
                _self.$pendingAnnotation = annotation;
                anotRiskDescription.clear();
                _self.editAnnotationView.show();
           }
        });

        // right click context item in ace
        ide.addEventListener("init.ext/code/code", function() {
            _self.nodes.push(
                mnuCtxEditor.insertBefore(new apf.item({
                    id : "mnuCtxEditorAddSubAnnotation",
                    caption : "Add to Risk Report (as sub annotation)",
                    command: "addSubAnnotation"
                }), mnuCtxEditor.firstChild)
            );
             _self.nodes.push(
                mnuCtxEditor.insertBefore(new apf.item({
                    id : "mnuCtxEditorAddRiskAnnotation",
                    caption : "Add to Risk Report",
                    command: "addRiskAnnotation"
                }), mnuCtxEditor.firstChild)
            );
        });
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
        this.$layoutItem.destroy(true, true);
    },
    onEditAnotDone: function () {
      this.$pendingAnnotation.long_description = anotRiskDescription.value;
      this.$pendingAnnotation.annotation_index = this.editableRiskReport.annotations.length;
      this.$pendingAnnotation.path = this.$pendingAnnotation.cloud9_path.split('/src/')[1];
      this.editableRiskReport.annotations.push(new Annotation(this.$pendingAnnotation));
      this.loadEditableRiskReportModel(this.editableRiskReport); 
      this.editAnnotationView.hide();
    }, 
    onEditSubAnotDone: function () {
      var selectedItems = editableAnnotationsList.getSelection();
      if(selectedItems.length > 0) {
          //TODO make sure the sub annotation is in the same file as the parent annotation,
          //     otherwise, they should be separate annotations
          var idx = parseInt(selectedItems[0].getAttribute('annotation_index'));
          var anot = this.editableRiskReport.annotations[idx];
          this.$pendingSubAnnotation.description = sanRiskDescription.value;
          anot.sub_annotations.push(new SubAnnotation(this.$pendingSubAnnotation));
          this.loadEditableRiskReportModel(this.editableRiskReport); 
      } else {
          util.alert('Failed to add sub annotation', 
                     'No parent annotation selected.');
      }
      this.editSubAnnotationView.hide();
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
            _self.riskReport = new RiskReport(path, json != null ? json.annotations : null);
            _self.loadRiskReportModel(_self.riskReport);
        });
    },
    loadRiskReportModel: function (riskReport) {
         if(riskReport) {
           annotationsList.getModel().load('<data>\n' + riskReport.toXml() + '</data>');
         } else {
           annotationsList.getModel().load('');
         }
    },
    loadEditableRiskReportModel: function (riskReport) {
         if(riskReport) {
           editableAnnotationsList.getModel().load('<data>\n' + riskReport.toXml() + '</data>');
         } else {
           editableAnnotationsList.getModel().load('');
         }
    },
    saveRiskReport: function () {
        fs.saveFile('/workspace/' + riskReportFilename.value, 
            JSON.stringify(this.editableRiskReport, null, 2), 
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
    closeRiskReport: function() {
        this.riskReport = null;
        this.loadRiskReportModel();
        var currEditor = editors.currentEditor;

        if(currEditor) {
          var currSession = currEditor.amlEditor.getSession();
          this.removeMarkers(currSession);
        }
    },
    closeEditableRiskReport: function() {
        this.editableRiskReport = null;
        this.loadEditableRiskReportModel();
        var currEditor = editors.currentEditor;

        if(currEditor) {
          var currSession = currEditor.amlEditor.getSession();
          this.removeMarkers(currSession);
        }
    },
    renderRiskReportPlaintext: function () {
        if(this.riskReport) {
          this.riskReport.toPlainText(function (text) {
            myutils.saveAndDisplayFileInNewWindow( 
              '/workspace/risk_report_'+myutils.guid()+'.txt', text
            )
          });
        }
    },
    renderRiskReportHtml: function () {
        if(this.riskReport) {
          this.riskReport.toHtml(function (html) {
            myutils.saveAndDisplayFileInNewWindow( 
              '/workspace/risk_report_'+myutils.guid()+'.html', html
            )
          });
        }
    },
    renderEditableRiskReportPlaintext: function () {
        if(this.editableRiskReport) {
          this.editableRiskReport.toPlainText(function (text) {
            myutils.saveAndDisplayFileInNewWindow( 
              '/workspace/risk_report_'+myutils.guid()+'.txt', text
            )
          });
        }
    },
    renderEditableRiskReportHtml: function () {
        if(this.editableRiskReport) {
          this.editableRiskReport.toHtml(function (html) {
            myutils.saveAndDisplayFileInNewWindow( 
              '/workspace/risk_report_'+myutils.guid()+'.html', html
            )
          });
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
    makeEditableRiskReportPanel : function() {
        var _self = this;
        // create editor if it does not exist
        if (this.$panel == null) {
            this.$panel = tabConsole.add(this.pageTitle, this.pageID);
            this.$panel.setAttribute("closebtn", true);

            tabConsole.set(this.pageID);

            this.customRiskReport = this.$panel.appendChild(riskReportEditor);
            riskReportEditor.setAttribute('visible', true);

            this.$panel.addEventListener("afterclose", function() {
                _self.removeNode();
                _self.$panel = null;
                return false;
            });
            
            apf.addEventListener('rowClicked', function(e) {
               if(e.owner.id == 'editableSubAnnotationsList' || e.owner.id == 'editableAnnotationsList') {
                   _self.clearPreviousHighlights();
                   _self.jumpToAndHighlight((e.owner.id == 'editableSubAnnotationsList'), 
                        editableAnnotationsList, editableSubAnnotationsList, _self.editableRiskReport); 
                   return false;
               }               
            });
            
            apf.addListener(editableSubAnnotationsList, 'keydown', function(e) {
                var pressed = e.htmlEvent.keyIdentifier;
                if(pressed == 'Down' || pressed == 'Up') {
                  _self.clearPreviousHighlights();
                  _self.jumpToAndHighlight(true, 
                        editableAnnotationsList, editableSubAnnotationsList, _self.editableRiskReport); 
                } else if (pressed == 'Left' || pressed == 'Right') {
                  editableAnnotationsList.focus();
                }
            })
            
            apf.addListener(editableSubAnnotationsList, 'focus', function(e) {
                _self.jumpToAndHighlight(true, 
                    editableAnnotationsList, editableSubAnnotationsList, _self.editableRiskReport); 
            })
            
            apf.addListener(editableAnnotationsList, 'focus', function(e) {
                _self.jumpToAndHighlight(false, 
                    editableAnnotationsList, editableSubAnnotationsList, _self.editableRiskReport); 
            })
            
            apf.addListener(editableAnnotationsList, 'keydown', function (e) {
                var pressed = e.htmlEvent.keyIdentifier;
                if(pressed == 'Down' || pressed == 'Up') {
                  _self.clearPreviousHighlights();
                  _self.jumpToAndHighlight(false, 
                        editableAnnotationsList, editableSubAnnotationsList, _self.editableRiskReport); 
                } else if (pressed == 'Left' || pressed == 'Right') {
                  editableSubAnnotationsList.focus();
                }
            });
            
        }
        else {
            tabConsole.appendChild(this.$panel);
            tabConsole.set(this.pageID);
        }
    },
    jumpToAndHighlight: function (sub, master, detail, model) {
      var _self = this;
      var selectedSubItems = detail.getSelection();
      var selectedItems = master.getSelection();
      
      if(selectedItems.length > 0) {
        //update the subAnnotationList
        //TODO why does subAnnotationsList sometimes take a double click to update???
        //     can this datagrid be bound directly to the selected annotation?
        detail.setModel(selectedItems[0].childNodes[1] || '<subannotations></subannotations>')

        // the index property is injected into the xml model as a way
        // to lookup the item in the backing object
        var idx = parseInt(selectedItems[0].getAttribute('annotation_index'));
        var anot = model.annotations[idx];
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
                var highlightRange = anot.getRangeInDocument(doc);

                if(highlightRange) {
                    //markers: highlights source code
                    _self.markerId = session.addMarker(
                       highlightRange,
                       'risk_annotation', function(stringBuilder, range, left, top, viewport) {
                            var charWidth = viewport.characterWidth;
                            var width = (range.end.column - range.start.column) * charWidth;
                            //console.log(anot.method, width > 0);
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
                   var sanHighlightRange = san.getRangeInDocument(doc);
                   if(sanHighlightRange) {  
                    _self.markerId = session.addMarker(
                        sanHighlightRange,
                        "sub_annotation", 
                        function(stringBuilder, range, left, top, viewport) {
                            var charWidth = viewport.characterWidth;
                            var width = (range.end.column - range.start.column) * charWidth;
                            //console.log(san.method, width > 0);
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
                     console.error('failed to highlight sub annotation: ' + san.toString());
                   }                   
                }
            }, 50);
        }

        ide.addEventListener('changeAnnotation', drawHighlights);

        myutils.jumpToFile({
          row:    (sub && selectedSubItems.length > 0 ?  
                    parseInt(selectedSubItems[0].getAttribute('start_line')): 
                    anot.start_line),
          column: anot.start_col,
          path:   anot.cloud9_path
        }, function (e) {
            console.log(e);
            drawHighlights();
            if(sub) detail.focus() 
            else    master.focus();
        });
        
      } else {
        console.warn('no risk annotation selected to jump to.');
      }
    }    
});

});
