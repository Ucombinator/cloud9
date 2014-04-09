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
var menus = require("ext/menus/menus");
var dock = require("ext/dockpanel/dockpanel");
var commands = require("ext/commands/commands");
var markup = require("text!ext/androidanalysis/RiskReportDockView.xml");
var css = require("text!ext/androidanalysis/style/analysis.css");

module.exports = ext.register("ext/androidanalysis/risk", {
    name     : "Android Risk Analysis",
    dev      : "ucombinator",
    alone    : true,
    deps     : [],
    type     : ext.GENERAL,
    markup   : markup,

    nodes : [],
    /* { file: '', description: '', annotations: [...] } */
    riskReport: null,
    /* { description: , file: , ln: , col:  } */
    highlighted: null,
    init : function () {
        this.riskReportView = riskReportView;
        var _self = this;
        
        
        apf.addEventListener('rowClicked', function(e) {
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
            
             /*else if(pressed == 'Right') {
              console.log('Right');
              subAnnotationsList.focus();
              e.htmlEvent.keyIdentifier = 'Down';
              setTimeout(function () {
                apf.dispatchEvent('keydown', e)
                //annotationsList.focus();
              }, 30);
              return false;
            } else if(pressed == 'Left') {
              console.log('Left');
              subAnnotationsList.focus();
              e.htmlEvent.keyIdentifier = 'Up';
              setTimeout(function () {
                apf.dispatchEvent('keydown', e)
                //annotationsList.focus();
              }, 30);
              return false;
            }*/
        });
        
        
        commands.addCommand({
            name: "android_analysis",
            hint: "Create an Android Analysis",
            msg: "<MESSAGE>",
            bindKey: {mac: "Shift-1", win: "Ctrl-1"},
            isAvailable : function() {
                return true;    
            },
            exec: function() {
                _self.riskReportView.show()
            }
        });
        
        this.nodes.push(
            menus.addItemByPath("File/Open Android Analysis", new apf.item({
                command : "android_analysis"
            }), 5400)
        ); 

       /* Just a plain menu...
        this.nodes.push(
            menus.addItemByPath("Edit/Extension Template", new apf.item({
                onclick : function(){
                    _self.winExtensionTemplate.show();
                }
            }), 5400)
        ); */
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
            //var datagridHtml = annotationsList.$ext;
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
        // adding post processed properties in order to:
        // 1) make the grid easier to read
        // 2) and the file lookup easier
        // for looking up in callbacks
        //  and reordering annotations easily
        var javaPkg = an.class_name.split('.');
        an.clazzName = javaPkg.pop();
        var relativePath = javaPkg.join('/');
        an.annotationIndex = i;
        an.fullPath = workspacePath + relativePath + '/' + an.file_name;
        
        for(var j = 0; j < an.sub_annotations.length; j++) {
          var san = an.sub_annotations[j];
          san.clazzName = san.class_name.split('.').pop();
        }
      }
      return json;
    }, 
    openRiskReport: function(path) {
        var _self = this;
        var baseUrl = apf.host;
        
        var http = new apf.http();
        http.getJSON(baseUrl + path, function(json, state, extra){
            if (state != apf.SUCCESS)
                return util.alert('Failed to load Risk Report', 
                  'Encountered: ' + extra.message, 
                  'open the file and verify the format is correct.');
            _self.riskReport = _self.transformRiskReport(json, path);
            _self.loadRiskReportModel(_self.riskReport);
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
    riskReportAsXml: function (riskReport, flatten) {
      if(!riskReport || !riskReport.annotations) return;
      
      var xml = '';
      var annotations = riskReport.annotations;
      
      if(flatten) {
        annotations = [];
        for(var i = 0; i < riskReport.annotations.length; i++) {
          var an = riskReport.annotations[i];
          annotations.push(an);
          if(!an.sub_annotations) continue;
          for(var j = 0; j < an.sub_annotations.length; j++) {
            var san = an.sub_annotations[j];
            san.fullPath = an.fullPath;
            annotations.push(san);
          }
        }
      }

      function annotationAsXml(an) {
        // converting package of class to filepath (
        // relative to Android project dir)
        
        var aXml = util.toXmlTag("annotation", {
            ln: an.start_line,
            col: an.start_col,
            clazz: an.clazzName || '-', // allowing alternates for flattening sub_annotations
            filename: an.fullPath,
            annotationIndex: an.annotationIndex,
            risk: an.risk_score || '-',
            method: an.method,
            description: an.long_description
        }, true /*exclude self-closing slash*/);
        var subsXml = ' <subannotations>\n';
        if(an.sub_annotations) {
          for(var i = 0; i < an.sub_annotations.length; i++) {
            subsXml += '   ' + subAnnotationAsXml(an.sub_annotations[i]) + '\n'
          }
        }
        return aXml + '\n' + subsXml +  ' </subannotations>\n</annotation>';
      }
      
      function subAnnotationAsXml(san) {
        var subAXml = util.toXmlTag("subannotation", {
            ln: san.start_line,
            col: san.start_col,
            method: san.method,
            clazz: san.class_name,
            risk: san.risk_score,
            description: san.description
        }, false /*include self-closing slash*/);
         return subAXml;
      }
      
      for(var i = 0; i < annotations.length; i++) {
          xml +=  annotationAsXml(annotations[i]) + '\n';
      }
      return xml;
    },
    save: function() {
      util.alert('Save Risk Report', 'Saving a risk report is unimplemented', 'Come back soon!');
    },
    close: function() {
      this.riskReport = null;
      this.loadRiskReportModel();
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
        subAnnotationsList.setModel(selectedItems[0].childNodes[1])
        
      
        // the index property is injected into the xml model as a way
        // to lookup the item in the backing object
        var idx = parseInt(selectedItems[0].getAttribute('annotationIndex'));
        var anot = this.riskReport.annotations[idx];
        var currEditor = editors.currentEditor;
  
        if(currEditor) {
          var currSession = currEditor.amlEditor.getSession();
          this.removeMarkers(currSession);
        }
        
        function drawHighlights() {
            ide.removeEventListener('changeAnnotation', drawHighlights);
            if(!editors.currentEditor) return;
            
            //var openBracePos = doc.findMatchingBracket({row: row, column: column});
            var firstInstrStartLine = anot.start_line - 1;
            var startLine = firstInstrStartLine;
            var startCol  = anot.start_col;
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
                // find method name in document
                var searchText = (anot.method != '<init>') ? anot.method : anot.clazzName.split('$').pop();
                
                while((startCol = doc.getLine(startLine).indexOf(searchText)) == -1) { 
                  if(--startLine < 0) break; //TODO method is <init> or something 
                }
                var annotations = session.getAnnotations();
                
                // find method body bounds in document
                var openBraceLine = startLine;
                var openBraceCol;
                while((openBraceCol = doc.getLine(openBraceLine).indexOf('{')) == -1) {
                  if(++openBraceLine == doc.getLength()) break; //TODO if source code has errors...
                }
               
                var closingBrace = session.findMatchingBracket({row: openBraceLine, column: openBraceCol+1})
                
                //TODO highlight the method, although this did not work
                //if(closingBrace) {
                //  new Selection(session)
                //    .addRange(new Range(openBraceLine, openBraceCol, closingBrace.row, closingBrace.column));
                //}
                
                // these disappear sometimes, so just removing them for now
                //annotation: adds the mouseover gutter marker
                //annotations.push({
                //    row: startLine,
                //    column: startCol,
                //    text: anot.method + ' (risk: ' + anot.risk_score + ')',
                //    type: 'info' // also warning and information
                //});

                //markers: highlights source code
                _self.markerId = session.addMarker(
                   new Range(startLine, startCol, startLine, (startCol + searchText.length)),
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
                
                for(var i = 0; i < anot.sub_annotations.length; i++) {
                   var san = anot.sub_annotations[i];
                   var sanStartLine = san.start_line - 1;
                   //annotations.push({
                   //  row: sanStartLine,
                   //  column: san.start_col,
                   //  text: san.description,
                   //  type: 'info'
                   //})
                   var sanMethod = (san.method == '<init>') ? 
                     san.clazzName.split(/[$.]/).pop() :
                     san.method;

                   var pattern    = '(.\\s*)?'+sanMethod+'\\s*\\(';
                   var firstMatch = new RegExp(pattern, 'm').exec(doc.getLine(sanStartLine));
                   if(firstMatch) {
                     _self.markerId = session.addMarker(
                        new Range(sanStartLine, firstMatch.index, 
                                  sanStartLine, firstMatch.index + firstMatch[0].length),
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
                   }                      
                }

                //session.setAnnotations(annotations);
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
            parseInt(selectedSubItems[0].getAttribute('ln')): anot.start_line) -1,
          column: anot.start_col,
          path: anot.fullPath
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
