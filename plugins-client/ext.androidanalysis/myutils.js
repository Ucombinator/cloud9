
define(function(require, exports, module) {
    var ide = require("core/ide");
    var util = require("core/util");
    var editors = require("ext/editors/editors");
    var fs = require("ext/filesystem/filesystem");
    var Range = require("ace/range").Range;
    var Document = require("ace/document").Document;

        // asynchronously retrieves a document in the cloud9 workspace
    function getDocument(path, callback) {
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
     }
        
    // Orient the range by document start/end order (rather than cursor start/end order)
    // in order to simplify highlighting when risk report is clicked.
    // Increment values to make like android dex source info (1-indexed)
    function orientRange(range) {
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
    }
        
    /**
    *  show file: (modified from ext.debugger/sources)
    *    options {path, row, column}
    */
    function jumpToFile(options) {
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
    
    // looks up the file node corresponding the path
    function getFileNode(path) {
        var file;
        // does it have the required? '/workspace' prefix?
        if (path && path.substring(0, ide.davPrefix.length) == ide.davPrefix) {
            file = fs.model.queryNode("//file[@path=" + util.escapeXpathString(path) + "]")
                || fs.createFileNodeFromPath(path);
        }
        return file;
    }
    
    function saveAndDisplayFileInNewWindow(fn, contents) {
        fs.saveFile(fn, contents, function(value, state, extra) {
            if (state !== apf.SUCCESS) {
                return util.alert("File Save Failed", fn, "Encountered " + extra.message);
            }
            window.open(fn, "_blank");
        });
    }
    
    exports.saveAndDisplayFileInNewWindow = saveAndDisplayFileInNewWindow;
    exports.getFileNode = getFileNode;
    exports.jumpToFile = jumpToFile;
    exports.orientRange = orientRange;
    exports.getDocument = getDocument;
    
})