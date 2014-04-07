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
        
        apf.addEventListener('rowClicked', function(row) {
            _self.clearPreviousHighlights();
            _self.jumpToAndHighlight();
        });

        apf.addListener(annotationsList, 'dragdrop', function (e) {
            var path;
            if(e.data.length > 0 && (path = e.data[0].getAttribute("path"))) {
                console.log('dropped file ' + path + ' on risk report grid'); 
                _self.openRiskReport(path, chkShowSinks.checked);
            }
            // TODO: get rid of the fly back animation on the cancelled drop somehow
            return false; //cancel the drop to avoid messing up the dom
        });
        
        apf.addListener(annotationsList, 'keydown', function (e) {
            var pressed = e.htmlEvent.keyIdentifier;
            if(pressed == 'Down' || pressed == 'Up') {
              _self.clearPreviousHighlights();
              _self.jumpToAndHighlight();
            }
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
        var javaPkg = an.class_name.split('.');
        // remove classname on end
        var className = javaPkg.pop();
        var relativePath = javaPkg.join('/');
        // add post processed properties in order to:
        // 1) make the grid easier to read
        // 2) and the file lookup easier
        an.clazzName = className;
        an.fullPath = workspacePath + relativePath + '/' + an.file_name;
      }
      return json;
    }, 
    openRiskReport: function(path) {
        var _self = this;
        var baseUrl = apf.host;
        
        var http = new apf.http();
        http.getJSON(baseUrl + path, function(json, state, extra){
            if (state != apf.SUCCESS)
                return util.alert('Failed to load file', 'http.get('+path+') failed.', 'Is the file path correct?');
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
           var annotationsXml = this.riskReportAsXml(riskReport, chkShowSinks.checked);
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
            'clazz': an.clazzName || '-', // allowing alternates for flattening sub_annotations
            filename: an.fullPath,
            risk: an.risk_score || '-',
            method: an.method || an.description
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
    jumpToAndHighlight: function () {
      var _self = this;
      var selectedItems = annotationsList.getSelection();
      
      if(selectedItems.length > 0) {
          
        var anot = selectedItems[0];
        function drawHighlights() {
            ide.removeEventListener('changeAnnotation', drawHighlights);
            //var openBracePos = doc.findMatchingBracket({row: row, column: column});
            var startLine = Math.max(0,parseInt(anot.getAttribute("ln")) - 1);
            var startCol  = parseInt(anot.getAttribute("col"));
            var session = editors.currentEditor.amlEditor.getSession();

            // the language worker clears the annotations, so wait for it to do it's work,
            // then add our annotations over the top
            // (although this may not be a problem for read-only java files...)
            setTimeout(function () {
                var annotations = session.getAnnotations();
                annotations.push({
                    row: startLine,
                    column: startCol,
                    text: anot.getAttribute("method") + ' (risk: ' + anot.getAttribute("risk") + ')',
                    type: "error" // also warning and information
                });
                //adds a mousover gutter marker
                session.setAnnotations(annotations);
                //TODO change to use endLine, endCol, type "text" instead of type "line"
                //highlights source code
                if(_self.markerId) session.removeMarker(_self.markerId);
                _self.markerId = session.addMarker(new Range(startLine, 0, startLine, 70),"risk_annotation", "text"); 
            }, 500);
        }
          
        function onJumpToFileComplete(e) {
            ide.removeEventListener('jumpedToFile', onJumpToFileComplete);
            console.log(e);
            drawHighlights();
            annotationsList.focus();
        }
        
        ide.addEventListener('changeAnnotation', drawHighlights);
        ide.addEventListener('jumpedToFile', onJumpToFileComplete);

        this.jumpToFile({
          row: parseInt(anot.getAttribute("ln")),
          column: parseInt(anot.getAttribute("col")),
          path: anot.getAttribute("filename")
        });
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
