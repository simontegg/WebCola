var tetrisbug;
(function (tetrisbug) {
    var width = 1280, height = 650;

    var color = d3.scale.category10();

    var makeEdgeBetween;
    var colans = cola;
    var graphfile = "graphdata/state_machine.json";
    function makeSVG() {
        var svg = d3.select("body").append("svg").attr("width", width).attr("height", height);

        svg.append('svg:defs').append('svg:marker').attr('id', 'end-arrow').attr('viewBox', '0 -5 10 10').attr('refX', 5).attr('markerWidth', 3).attr('markerHeight', 3).attr('orient', 'auto').append('svg:path').attr('d', 'M0,-5L10,0L0,5L2,0').attr('stroke-width', '0px');

        return svg;
    }
    function flatGraph() {
        var d3cola = colans.d3adaptor().linkDistance(150).avoidOverlaps(true).size([width, height]);

        var svg = makeSVG();

        d3.json(graphfile, function (error, graph) {
            graph.nodes.forEach(function (v) {
                v.width = 200;
                v.height = 50;
            });
            d3cola.nodes(graph.nodes).links(graph.links).start(10, 10, 10);

            var linkTypes = getLinkTypes(graph.links);

            var link = svg.selectAll(".link").data(graph.links).enter().append("line").attr("stroke", function (l) {
                return color(linkTypes.lookup[l.type]);
            }).attr("fill", function (l) {
                return color(linkTypes.lookup[l.type]);
            }).attr("class", "link");

            var margin = 10;
            var node = svg.selectAll(".node").data(graph.nodes).enter().append("rect").attr("class", "node").attr("width", function (d) {
                return d.width + 2 * margin;
            }).attr("height", function (d) {
                return d.height + 2 * margin;
            }).attr("rx", 4).attr("ry", 4).call(d3cola.drag);
            var label = svg.selectAll(".label").data(graph.nodes).enter().append("text").attr("class", "label").text(function (d) {
                return d.name;
            }).call(d3cola.drag);

            node.append("title").text(function (d) {
                return d.name;
            });

            d3cola.on("tick", function () {
                node.each(function (d) {
                    return d.innerBounds = d.bounds.inflate(-margin);
                });
                link.each(function (d) {
                    cola.vpsc.makeEdgeBetween(d, d.source.innerBounds, d.target.innerBounds, 5);
                    if (isIE())
                        this.parentNode.insertBefore(this, this);
                });

                link.attr("x1", function (d) {
                    return d.sourceIntersection.x;
                }).attr("y1", function (d) {
                    return d.sourceIntersection.y;
                }).attr("x2", function (d) {
                    return d.arrowStart.x;
                }).attr("y2", function (d) {
                    return d.arrowStart.y;
                });

                node.attr("x", function (d) {
                    return d.innerBounds.x;
                }).attr("y", function (d) {
                    return d.innerBounds.y;
                }).attr("width", function (d) {
                    return d.innerBounds.width();
                }).attr("height", function (d) {
                    return d.innerBounds.height();
                });

                label.attr("x", function (d) {
                    return d.x;
                }).attr("y", function (d) {
                    var h = this.getBBox().height;
                    return d.y + h / 3.5;
                });
            });

            var indent = 0, topindent = 0;
            var swatches = svg.selectAll('.swatch').data(linkTypes.list).enter().append('rect').attr('x', indent).attr('y', function (l, i) {
                return topindent + 40 * i;
            }).attr('width', 30).attr('height', 30).attr('fill', function (l, i) {
                return color(i);
            }).attr('class', 'swatch');
            var swatchlabels = svg.selectAll('.swatchlabel').data(linkTypes.list).enter().append('text').text(function (t) {
                return t ? t : "Start";
            }).attr('x', indent + 40).attr('y', function (l, i) {
                return topindent + 20 + 40 * i;
            }).attr('fill', 'black').attr('class', 'swatchlabel');
        });
    }

    function expandGroup(g, ms) {
        if (g.groups) {
            g.groups.forEach(function (cg) {
                return expandGroup(cg, ms);
            });
        }
        if (g.leaves) {
            g.leaves.forEach(function (l) {
                ms.push(l.index + 1);
            });
        }
    }

    function getId(v, n) {
        return (typeof v.index === 'number' ? v.index : v.id + n) + 1;
    }

    function powerGraph() {
        var d3cola = colans.d3adaptor().linkDistance(80).handleDisconnected(false).avoidOverlaps(true).size([width, height]);

        var svg = makeSVG();

        d3.json(graphfile, function (error, graph) {
            graph.nodes.forEach(function (v, i) {
                v.index = i;
                v.width = 160;
                v.height = 50;
            });
            var powerGraph;

            var doLayout = function (response) {
                var vs = response.nodes.filter(function (v) {
                    return v.label;
                });
                vs.forEach(function (v) {
                    var index = Number(v.label) - 1;
                    var node = graph.nodes[index];
                    node.y = Number(v.y) / 1.2;
                    node.x = Number(v.x) * 1.6 - 70;
                    node.fixed = 1;
                });
                var n = graph.nodes.length, _id = function (v) {
                    return getId(v, n) - 1;
                }, g = {
                    nodes: graph.nodes.map(function (d) {
                        return {
                            id: _id(d),
                            name: d.name,
                            bounds: new cola.vpsc.Rectangle(d.x, d.x + d.width, d.y, d.y + d.height)
                        };
                    }).concat(powerGraph.groups.map(function (d) {
                        return {
                            id: _id(d),
                            children: (typeof d.groups !== 'undefined' ? d.groups.map(function (c) {
                                return n + c.id;
                            }) : []).concat(typeof d.leaves !== 'undefined' ? d.leaves.map(function (c) {
                                return c.index;
                            }) : [])
                        };
                    })),
                    edges: powerGraph.powerEdges.map(function (e) {
                        return {
                            source: _id(e.source),
                            target: _id(e.target),
                            type: e.type
                        };
                    })
                };
                var gridrouter = new cola.GridRouter(g.nodes, {
                    getChildren: function (v) {
                        return v.children;
                    },
                    getBounds: function (v) {
                        return v.bounds;
                    }
                });

                var gs = gridrouter.backToFront.filter(function (v) {
                    return !v.leaf;
                });
                var group = svg.selectAll(".group").data(gs).enter().append("rect").attr("rx", 8).attr("ry", 8).attr('x', function (d) {
                    return d.rect.x;
                }).attr('y', function (d) {
                    return d.rect.y;
                }).attr('width', function (d) {
                    return d.rect.width();
                }).attr('height', function (d) {
                    return d.rect.height();
                }).attr("class", "group");

                var margin = 10;
                var node = svg.selectAll(".node").data(graph.nodes).enter().append("rect").attr("class", "node").attr('x', function (d) {
                    return d.x;
                }).attr('y', function (d) {
                    return d.y;
                }).attr("width", function (d) {
                    return d.width;
                }).attr("height", function (d) {
                    return d.height;
                }).attr("rx", 4).attr("ry", 4).call(d3cola.drag);
                var label = svg.selectAll(".label").data(graph.nodes).enter().append("text").attr("class", "label").attr("transform", function (d) {
                    return "translate(" + (d.x + 10) + "," + (d.y + 25 - d.height / 2) + ")";
                });

                var insertLinebreaks = function (d) {
                    var el = d3.select(this);
                    var words = d.name.split('_');
                    el.text('');
                    words = [words[0] + ' ' + words[1]].concat(words.slice(2));

                    for (var i = 0; i < words.length; i++) {
                        var tspan = el.append('tspan').text(words[i]);
                        tspan.attr('x', 0).attr('dy', '20').style('text-anchor', 'start').attr("font-size", "15");
                        if (words.length < 2) {
                            tspan.attr('y', 10);
                        }
                    }
                };

                label.each(insertLinebreaks);

                node.append("title").text(function (d) {
                    return d.name;
                });

                var routes = gridrouter.routeEdges(g.edges, 10, function (e) {
                    return e.source;
                }, function (e) {
                    return e.target;
                });

                g.edges.forEach(function (e, j) {
                    var route = routes[j];
                    var id = 'e' + e.source + '-' + e.target;
                    var cornerradius = 10;
                    var arrowwidth = 6;
                    var arrowheight = 12;
                    var c = color(e.type);
                    var linewidth = 5;
                    var path = 'M ' + route[0][0].x + ' ' + route[0][0].y + ' ';
                    if (route.length > 1) {
                        for (var i = 0; i < route.length; i++) {
                            var li = route[i];
                            var x = li[1].x, y = li[1].y;
                            var dx = x - li[0].x;
                            var dy = y - li[0].y;
                            if (i < route.length - 1) {
                                if (Math.abs(dx) > 0) {
                                    x -= dx / Math.abs(dx) * cornerradius;
                                } else {
                                    y -= dy / Math.abs(dy) * cornerradius;
                                }
                                path += 'L ' + x + ' ' + y + ' ';
                                var l = route[i + 1];
                                var x0 = l[0].x, y0 = l[0].y;
                                var x1 = l[1].x;
                                var y1 = l[1].y;
                                dx = x1 - x0;
                                dy = y1 - y0;
                                var angle = cola.GridRouter.angleBetween2Lines(li, l) < 0 ? 1 : 0;
                                console.log(cola.GridRouter.angleBetween2Lines(li, l));
                                var x2, y2;
                                if (Math.abs(dx) > 0) {
                                    x2 = x0 + dx / Math.abs(dx) * cornerradius;
                                    y2 = y0;
                                } else {
                                    x2 = x0;
                                    y2 = y0 + dy / Math.abs(dy) * cornerradius;
                                }
                                var cx = Math.abs(x2 - x);
                                var cy = Math.abs(y2 - y);
                                path += 'A ' + cx + ' ' + cy + ' 0 0 ' + angle + ' ' + x2 + ' ' + y2 + ' ';
                            } else {
                                var arrowtip = [x, y];
                                var arrowcorner1, arrowcorner2;
                                if (Math.abs(dx) > 0) {
                                    x -= dx / Math.abs(dx) * arrowheight;
                                    arrowcorner1 = [x, y + arrowwidth];
                                    arrowcorner2 = [x, y - arrowwidth];
                                } else {
                                    y -= dy / Math.abs(dy) * arrowheight;
                                    arrowcorner1 = [x + arrowwidth, y];
                                    arrowcorner2 = [x - arrowwidth, y];
                                }
                                path += 'L ' + x + ' ' + y + ' ';
                                svg.append('path').attr('d', 'M ' + arrowtip[0] + ' ' + arrowtip[1] + ' L ' + arrowcorner1[0] + ' ' + arrowcorner1[1] + ' L ' + arrowcorner2[0] + ' ' + arrowcorner2[1] + ' Z').attr('stroke', '#550000').attr('stroke-width', 2);
                                svg.append('path').attr('d', 'M ' + arrowtip[0] + ' ' + arrowtip[1] + ' L ' + arrowcorner1[0] + ' ' + arrowcorner1[1] + ' L ' + arrowcorner2[0] + ' ' + arrowcorner2[1]).attr('stroke', 'none').attr('fill', c);
                            }
                        }
                    } else {
                        var li = route[0];
                        var x = li[1].x, y = li[1].y;
                        var dx = x - li[0].x;
                        var dy = y - li[0].y;
                        var arrowtip = [x, y];
                        var arrowcorner1, arrowcorner2;
                        if (Math.abs(dx) > 0) {
                            x -= dx / Math.abs(dx) * arrowheight;
                            arrowcorner1 = [x, y + arrowwidth];
                            arrowcorner2 = [x, y - arrowwidth];
                        } else {
                            y -= dy / Math.abs(dy) * arrowheight;
                            arrowcorner1 = [x + arrowwidth, y];
                            arrowcorner2 = [x - arrowwidth, y];
                        }
                        path += 'L ' + x + ' ' + y + ' ';
                        svg.append('path').attr('d', 'M ' + arrowtip[0] + ' ' + arrowtip[1] + ' L ' + arrowcorner1[0] + ' ' + arrowcorner1[1] + ' L ' + arrowcorner2[0] + ' ' + arrowcorner2[1] + ' Z').attr('stroke', '#550000').attr('stroke-width', 2);
                        svg.append('path').attr('d', 'M ' + arrowtip[0] + ' ' + arrowtip[1] + ' L ' + arrowcorner1[0] + ' ' + arrowcorner1[1] + ' L ' + arrowcorner2[0] + ' ' + arrowcorner2[1]).attr('stroke', 'none').attr('fill', c);
                    }
                    svg.append('path').attr('d', path).attr('fill', 'none').attr('stroke', '#550000').attr('stroke-width', linewidth + 2);
                    svg.append('path').attr('id', id).attr('d', path).attr('fill', 'none').attr('stroke', c).attr('stroke-width', linewidth);
                });
            };
            var linkTypes = getLinkTypes(graph.links);
            d3cola.nodes(graph.nodes).links(graph.links).linkType(function (l) {
                return linkTypes.lookup[l.type];
            }).powerGraphGroups(function (d) {
                return (powerGraph = d).groups.forEach(function (v) {
                    return v.padding = 10;
                });
            });

            var modules = { N: graph.nodes.length, ms: [], edges: [] };
            var n = modules.N;
            powerGraph.groups.forEach(function (g) {
                var m = [];
                expandGroup(g, m);
                modules.ms.push(m);
            });
            powerGraph.powerEdges.forEach(function (e) {
                var N = graph.nodes.length;
                modules.edges.push({ source: getId(e.source, N), target: getId(e.target, N) });
            });

             {
                d3.json(graphfile.replace(/.json/, 'pgresponse.json'), function (error, response) {
                    doLayout(response);
                });
            }
        });
    }
    function getLinkTypes(links) {
        var linkTypes = { list: [], lookup: {} };
        links.forEach(function (l) {
            return linkTypes.lookup[l.type] = {};
        });
        var typeCount = 0;
        for (var type in linkTypes.lookup) {
            linkTypes.list.push(type);
            linkTypes.lookup[type] = typeCount++;
        }
        return linkTypes;
    }

    function isIE() {
        return ((navigator.appName == 'Microsoft Internet Explorer') || ((navigator.appName == 'Netscape') && (new RegExp("Trident/.*rv:([0-9]{1,}[\.0-9]{0,})").exec(navigator.userAgent) != null)));
    }

    flatGraph();
    powerGraph();
})(tetrisbug || (tetrisbug = {}));
