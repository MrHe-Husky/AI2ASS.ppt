#target illustrator;
#targetengine main;
var ai2assBackend, backendScript, bt, dlg, dlgRes, exportMethods, k, objToString, outputFormats, pathCombiningStrategies, radioString, v, win;

ai2assBackend = function(options) {
  var ASS_createDrawingFromPoints, black, checkLinear, countPathItems, doc, drawing, handleGray, handleRGB, manageColor, manageOpacity, methods, org, pWin, run, zeroPad;
  app.userInteractionLevel = UserInteractionLevel.DISPLAYALERTS;
  pWin = new Window("palette");
  pWin.text = "Progress Occurs";
  pWin.pBar = pWin.add("progressbar", void 0, 0, 250);
  pWin.pBar.preferredSize = [250, 10];
  doc = app.activeDocument;
  org = doc.rulerOrigin;
  black = new RGBColor();
  countPathItems = function(obj) {
    var count, recurse;
    recurse = function(obj) {
      var i, l, layer, len, len1, len2, m, pageItem, path, ref, ref1, ref2, results, results1, results2;
      if (!obj.hidden) {
        switch (obj.typename) {
          case "Document":
            ref = obj.layers;
            results = [];
            for (i = 0, len = ref.length; i < len; i++) {
              layer = ref[i];
              results.push(recurse(layer));
            }
            return results;
            break;
          case "Layer":
          case "GroupItem":
            ref1 = obj.pageItems;
            results1 = [];
            for (l = 0, len1 = ref1.length; l < len1; l++) {
              pageItem = ref1[l];
              results1.push(recurse(pageItem));
            }
            return results1;
            break;
          case "CompoundPathItem":
            ref2 = obj.pathItems;
            results2 = [];
            for (m = 0, len2 = ref2.length; m < len2; m++) {
              path = ref2[m];
              results2.push(recurse(path));
            }
            return results2;
            break;
          case "PathItem":
            return count += 1;
        }
      }
    };
    count = 0;
    recurse(obj);
    return count;
  };
  run = function(root, includeEmptyLayers) {
    var output;
    if (root == null) {
      root = doc;
    }
    output = {
      combineStrategy: "safe",
      layers: [],
      pathCnt: null,
      processedPathCnt: 0,
      tempLayer: null,
      makeTempLayer: function(name) {
        if (name == null) {
          name = "AI2ASS_tmp";
        }
        this.tempLayer = doc.layers.add();
        this.tempLayer.name = name;
        return this.tempLayer.zOrder(ZOrderMethod.SENDTOBACK);
      },
      makeClip: function(clippingPath) {
        var clip;
        clip = {
          tempGroup: null,
          isVisible: false,
          output: this,
          add: function(clippingPath) {
            var copy, prevSelection;
            if (this.output.tempLayer == null) {
              this.output.makeTempLayer();
            }
            if (!this.tempGroup) {
              this.tempGroup = this.output.tempLayer.groupItems.add();
            }
            copy = clippingPath.duplicate(this.tempGroup, ElementPlacement.PLACEATBEGINNING);
            copy.filled = true;
            copy.stroked = false;
            copy.clipping = false;
            copy.fillColor = black;
            if (this.tempGroup.pageItems.length > 1) {
              prevSelection = doc.selection;
              doc.selection = [this.tempGroup];
              app.executeMenuCommand("Live Pathfinder Intersect");
              app.executeMenuCommand("expandStyle");
              this.tempGroup = doc.selection[0];
              if (this.tempGroup.pageItems.length === 1) {
                this.isVisible = true;
              } else {
                this.isVisible = false;
                this.tempGroup.pageItems.removeAll();
              }
              return doc.selection = prevSelection;
            } else {
              return this.isVisible = true;
            }
          },
          copy: function() {
            return makeClip(this.tempGroup.pageItems[0]);
          },
          get: function() {
            return this.tempGroup.pageItems[0];
          },
          getASS: function() {
            var drawing;
            drawing = ASS_createDrawingFromPoints(this.tempGroup.pageItems[0].pathPoints);
            return "\\clip(" + (drawing.join(' ')) + ")";
          }
        };
        clip.add(clippingPath);
        return clip;
      },
      makeLayer: function(emptyPrefix) {
        var layer;
        layer = {
          groups: [],
          currGroupIdx: -1,
          currGroup: null,
          emptyPrefix: null,
          makeMergeGroup: function() {
            var group;
            group = {
              dirtyRects: [],
              lines: {},
              layer: this,
              addPath: function(path, prefix) {
                var drawing;
                if (!this.isZeroArea(path.visibleBounds)) {
                  this.dirtyRects.push(path.visibleBounds);
                  drawing = ASS_createDrawingFromPoints(path.pathPoints);
                  if (this.lines[prefix] != null) {
                    return Array.prototype.push.apply(this.lines[prefix], drawing);
                  } else {
                    return this.lines[prefix] = drawing;
                  }
                }
              },
              isZeroArea: function(bounds) {
                return bounds[2] - bounds[0] === 0 && bounds[3] - bounds[1] === 0;
              },
              isMergeable: function(path) {
                var bounds, i, len, rect, ref;
                if (path.parent.typename === "CompoundPathItem") {
                  return true;
                }
                switch (this.layer.combineStrategy) {
                  case "off":
                    return false;
                  case "any":
                    return true;
                  case "safe":
                    bounds = path.visibleBounds;
                    if (this.isZeroArea(bounds)) {
                      return true;
                    }
                    ref = this.dirtyRects;
                    for (i = 0, len = ref.length; i < len; i++) {
                      rect = ref[i];
                      if (bounds[2] > rect[0] && bounds[0] < rect[2] && bounds[3] < rect[1] && bounds[1] > rect[3]) {
                        return false;
                      }
                    }
                    return true;
                }
              }
            };
            return group;
          },
          addGroup: function() {
            this.currGroupIdx += 1;
            this.currGroup = this.makeMergeGroup();
            return this.groups[this.currGroupIdx] = this.currGroup;
          },
          addPath: function(path, prefix) {
            if (!this.currGroup.isMergeable(path)) {
              this.addGroup();
            }
            return this.currGroup.addPath(path, prefix);
          }
        };
        layer.emptyPrefix = emptyPrefix;
        layer.combineStrategy = this.combineStrategy;
        layer.addGroup();
        return layer;
      },
      process: function(obj, clip, opacity) {
        var clipPath, i, l, layer, m, n, pI, path, ref, ref1, ref2, ref3, results, results1, results2, results3, subPageItem;
        if (opacity == null) {
          opacity = 100;
        }
        if (this.pathCnt == null) {
          this.pathCnt = countPathItems(obj);
        }
        if (!obj.hidden && ((clip == null) || clip.isVisible)) {
          opacity = obj.opacity != null ? opacity * obj.opacity / 100 : 100;
          switch (obj.typename) {
            case "Document":
              ref = obj.layers;
              results = [];
              for (i = ref.length - 1; i >= 0; i += -1) {
                layer = ref[i];
                results.push(this.process(layer));
              }
              return results;
              break;
            case "Layer":
              if (obj.pageItems.length === 0) {
                return this.layers[obj.zOrderPosition] = this.makeLayer(this.emptyPrefix(obj.zOrderPosition, obj.name));
              } else {
                ref1 = obj.pageItems;
                results1 = [];
                for (l = ref1.length - 1; l >= 0; l += -1) {
                  subPageItem = ref1[l];
                  results1.push(this.process(subPageItem, null, opacity));
                }
                return results1;
              }
              break;
            case "CompoundPathItem":
              ref2 = obj.pathItems;
              results2 = [];
              for (m = ref2.length - 1; m >= 0; m += -1) {
                path = ref2[m];
                results2.push(this.process(path, clip, opacity));
              }
              return results2;
              break;
            case "GroupItem":
              if (obj.clipped) {
                clipPath = ((function() {
                  var len, n, ref3, results3;
                  ref3 = obj.pageItems;
                  results3 = [];
                  for (n = 0, len = ref3.length; n < len; n++) {
                    pI = ref3[n];
                    if (pI.clipping) {
                      results3.push(pI);
                    }
                  }
                  return results3;
                })())[0];
                if (clip != null) {
                  clip = clip.copy();
                  clip.add(clipPath);
                } else {
                  clip = this.makeClip(clipPath);
                }
                this.processedPathCnt += 1;
              }
              ref3 = obj.pageItems;
              results3 = [];
              for (n = ref3.length - 1; n >= 0; n += -1) {
                subPageItem = ref3[n];
                if (!subPageItem.clipping) {
                  results3.push(this.process(subPageItem, clip, opacity));
                }
              }
              return results3;
              break;
            case "PathItem":
              if (this.processedPathCnt % 10 === 0) {
                pWin.pBar.value = Math.ceil(this.processedPathCnt * 250 / this.pathCnt);
                pWin.update();
              }
              if (!(obj.guides || !(obj.stroked || obj.filled || obj.clipping) || !obj.layer.visible)) {
                this.appendPath(obj, clip, opacity);
              }
              return this.processedPathCnt += 1;
          }
        }
      },
      appendPath: function(path, clipObj, opacity) {
        var alpha, clip, fill, layer, layerName, layerNum, prefix, stroke;
        stroke = manageColor(path, "strokeColor", 3);
        fill = manageColor(path, "fillColor", 1);
        layerName = path.layer.name;
        layerNum = path.layer.zOrderPosition;
        alpha = manageOpacity(opacity);
        clip = clipObj != null ? clipObj.getASS() : "";
        prefix = this.prefix(stroke, fill, clip, alpha, layerNum, layerName);
        layer = this.layers[layerNum];
        if (layer == null) {
          layer = this.makeLayer();
          this.layers[layerNum] = layer;
        }
        return layer.addPath(path, prefix);
      },
      prefix: function(stroke, fill, clip, alpha) {
        return "{\\an7\\pos(0,0)" + stroke + fill + alpha + clip + "\\p1}";
      },
      emptyPrefix: function() {
        return "";
      },
      suffix: function() {
        return "{\\p0}";
      },
      get: function(includeEmptyLayers) {
        var drawing, fragments, i, l, layer, len, len1, mergeGroup, prefix, ref, ref1, ref2, suffix;
        fragments = [];
        suffix = this.suffix();
        ref = this.layers;
        for (i = 0, len = ref.length; i < len; i++) {
          layer = ref[i];
          if (!(layer != null)) {
            continue;
          }
          if (includeEmptyLayers && (layer.emptyPrefix != null)) {
            fragments.push(layer.emptyPrefix);
            fragments.push("\n");
          }
          ref1 = layer.groups;
          for (l = 0, len1 = ref1.length; l < len1; l++) {
            mergeGroup = ref1[l];
            ref2 = mergeGroup.lines;
            for (prefix in ref2) {
              drawing = ref2[prefix];
              fragments.push(prefix);
              fragments.push(drawing.join(" "));
              fragments.push(suffix);
              fragments.push("\n");
            }
          }
        }
        fragments.pop();
        return fragments.join("");
      }
    };
    if (options.combineStrategy != null) {
      output.combineStrategy = options.combineStrategy;
    }
    switch (options.wrapper) {
      case "clip":
        output.prefix = function() {
          return "\\clip(";
        };
        output.suffix = function() {
          return ")";
        };
        break;
      case "iclip":
        output.prefix = function() {
          return "\\iclip(";
        };
        output.suffix = function() {
          return ")";
        };
        break;
      case "bare":
        output.prefix = function() {
          return "";
        };
        output.suffix = function() {
          return "";
        };
        break;
      case "line":
        output.prefix = function(stroke, fill, clip, alpha, layerNum, layerName) {
          return "Dialogue: " + layerNum + ",0:00:00.00,0:00:00.00,AI," + layerName + ",0,0,0,,{\\an7\\pos(0,0)" + stroke + fill + alpha + clip + "\\p1}";
        };
        output.suffix = function() {
          return "";
        };
        output.emptyPrefix = function(layerNum, layerName) {
          return "Dialogue: " + layerNum + ",0:00:00.00,0:00:00.00,AI," + layerName + ",0,0,0,,";
        };
    }
    if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
      alert("Your colorspace needs to be RGB if you want colors.");
    }
    pWin.show();
    output.process(root);
    if (output.tempLayer != null) {
      output.tempLayer.remove();
    }
    pWin.close();
    return output.get(includeEmptyLayers);
  };
  drawing = {
    commands: [],
    "new": function() {
      return this.commands = [];
    },
    get: function() {
      return this.commands;
    },
    CmdTypes: {
      None: -1,
      Move: 0,
      Linear: 1,
      Cubic: 2
    },
    prevCmdType: -1,
    addMove: function(point) {
      this.commands.push("m");
      this.addCoords(point.anchor);
      return this.prevCmdType = this.CmdTypes.Move;
    },
    addLinear: function(point) {
      if (this.prevCmdType !== this.CmdTypes.Linear) {
        this.commands.push("l");
        this.prevCmdType = this.CmdTypes.Linear;
      }
      this.commands.push;
      return this.addCoords(point.anchor);
    },
    addCubic: function(currPoint, prevPoint) {
      if (this.prevCmdType !== this.CmdTypes.Cubic) {
        this.commands.push("b");
        this.prevCmdType = this.CmdTypes.Cubic;
      }
      this.addCoords(prevPoint.rightDirection);
      this.addCoords(currPoint.leftDirection);
      return this.addCoords(currPoint.anchor);
    },
    addCoords: function(coordArr) {
      this.commands.push(Math.round((coordArr[0] + org[0]) * 100) / 100);
      return this.commands.push(Math.round((doc.height - (org[1] + coordArr[1])) * 100) / 100);
    }
  };
  checkLinear = function(currPoint, prevPoint) {
    var p1, p2;
    p1 = prevPoint.anchor[0] === prevPoint.rightDirection[0] && prevPoint.anchor[1] === prevPoint.rightDirection[1];
    p2 = currPoint.anchor[0] === currPoint.leftDirection[0] && currPoint.anchor[1] === currPoint.leftDirection[1];
    return p1 && p2;
  };
  zeroPad = function(num) {
    var hexStr;
    hexStr = num.toString(16).toUpperCase();
    if (num < 16) {
      return "0" + hexStr;
    } else {
      return hexStr;
    }
  };
  handleGray = function(theColor) {
    var pct;
    pct = theColor.gray;
    pct = Math.round((100 - pct) * 255 / 100);
    return "&H" + (zeroPad(pct)) + (zeroPad(pct)) + (zeroPad(pct)) + "&";
  };
  handleRGB = function(theColor) {
    var b, g, r;
    r = Math.round(theColor.red);
    g = Math.round(theColor.green);
    b = Math.round(theColor.blue);
    return "&H" + (zeroPad(b)) + (zeroPad(g)) + (zeroPad(r)) + "&";
  };
  manageColor = function(currPath, field, ASSField) {
    var fmt;
    fmt = "";
    switch (currPath[field].typename) {
      case "RGBColor":
        fmt = handleRGB(currPath[field]);
        break;
      case "GrayColor":
        fmt = handleGray(currPath[field]);
        break;
      case "NoColor":
        switch (field) {
          case "fillColor":
            return "\\" + ASSField + "a&HFF&";
          case "strokeColor":
            return "";
        }
        break;
      default:
        return "";
    }
    return "\\" + ASSField + "c" + fmt;
  };
  manageOpacity = function(opacity) {
    if (opacity >= 100) {
      return "";
    }
    return "\\alpha&H" + (zeroPad(255 - Math.round(opacity) / 100 * 255)) + "&";
  };
  ASS_createDrawingFromPoints = function(pathPoints) {
    var currPoint, i, j, prevPoint, ref;
    drawing["new"]();
    if (pathPoints.length > 0) {
      drawing.addMove(pathPoints[0]);
      for (j = i = 1, ref = pathPoints.length; i < ref; j = i += 1) {
        currPoint = pathPoints[j];
        prevPoint = pathPoints[j - 1];
        if (checkLinear(currPoint, prevPoint)) {
          drawing.addLinear(currPoint);
        } else {
          drawing.addCubic(currPoint, prevPoint);
        }
      }
      prevPoint = pathPoints[pathPoints.length - 1];
      currPoint = pathPoints[0];
      if (checkLinear(currPoint, prevPoint)) {
        drawing.addLinear(currPoint);
      } else {
        drawing.addCubic(currPoint, prevPoint);
      }
      return drawing.get();
    }
  };
  methods = {
    collectActiveLayer: function() {
      var currLayer;
      currLayer = doc.activeLayer;
      if (!currLayer.visible) {
        return "Not doing anything to that invisible layer.";
      }
      return run(currLayer);
    },
    collectAllLayers: function() {
      return run();
    },
    collectAllLayersIncludeEmpty: function() {
      return run(doc, true);
    }
  };
  return methods[options.method]();
};

dlgRes = "Group { orientation:'column', alignChildren: ['fill', 'fill'], output: Panel { orientation:'column', text: 'ASS Output', edit: EditText {text: 'have ass, will typeset', properties: {multiline: true}, alignment: ['fill', 'fill'], preferredSize: [-1, 100] } }, outputFormat: Panel { orientation:'column', text: 'Output Format', clip: Group {orientation: 'row', alignChildren: ['fill', 'fill'], spacing: 5, noclip: RadioButton {text: 'Drawing', value: true}, clip: RadioButton {text: '\\\\clip'}, iclip: RadioButton {text: '\\\\iclip'}, bare: RadioButton {text: 'Bare'}, line: RadioButton {text: 'Line'} }, }, settings: Panel {orientation: 'column', alignChildren: ['left','fill'], text: 'Settings', collectionTarget: DropDownList {title: 'Collection Target:'}, pathCombining: DropDownList {title: 'Path Combining:'} }, export: Button {text: 'Export'} }";

win = new Window("palette", "Export ASS", void 0, {});

dlg = win.add(dlgRes);

outputFormats = {
  "Drawing:": "noclip",
  "\\clip": "clip",
  "\\iclip": "iclip",
  "Bare": "bare",
  "Line": "line"
};

exportMethods = {
  "Active Layer": "collectActiveLayer",
  "Non-Empty Layers": "collectAllLayers",
  "All Layers": "collectAllLayersIncludeEmpty"
};

for (k in exportMethods) {
  v = exportMethods[k];
  dlg.settings.collectionTarget.add("item", k);
}

dlg.settings.collectionTarget.selection = 0;

pathCombiningStrategies = {
  "Disabled": "off",
  "Safe (Maintain Order)": "safe",
  "Ignore Blending Order": "any"
};

for (k in pathCombiningStrategies) {
  v = pathCombiningStrategies[k];
  dlg.settings.pathCombining.add("item", k);
}

dlg.settings.pathCombining.selection = 1;

bt = new BridgeTalk;

bt.target = "illustrator";

backendScript = ai2assBackend.toString();

radioString = function(radioGroup) {
  var child, i, len, ref;
  ref = radioGroup.children;
  for (i = 0, len = ref.length; i < len; i++) {
    child = ref[i];
    if (child.value) {
      return outputFormats[child.text];
    }
  }
};

objToString = function(obj) {
  var fragments;
  fragments = ((function() {
    var results;
    results = [];
    for (k in obj) {
      v = obj[k];
      results.push(k + ": \"" + v + "\"");
    }
    return results;
  })()).join(", ");
  return "{" + fragments + "}";
};

dlg["export"].onClick = function() {
  var options;
  dlg.output.edit.active = false;
  options = objToString({
    method: exportMethods[dlg.settings.collectionTarget.selection.text],
    wrapper: radioString(dlg.outputFormat.clip),
    combineStrategy: pathCombiningStrategies[dlg.settings.pathCombining.selection.text]
  });
  bt.body = "(" + backendScript + ")(" + options + ");";
  bt.onResult = function(result) {
    dlg.output.edit.text = result.body.replace(/\\\\/g, "\\").replace(/\\n/g, "\n");
    return dlg.output.edit.active = true;
  };
  bt.onError = function(err) {
    return alert(err.body + " (" + a.headers["Error-Code"] + ")");
  };
  return bt.send();
};

win.show();
