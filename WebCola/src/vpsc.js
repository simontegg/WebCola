define(["require", "exports"], function(require, exports) {
    var PositionStats = (function () {
        function PositionStats(scale) {
            this.scale = scale;
            this.AB = 0;
            this.AD = 0;
            this.A2 = 0;
        }
        PositionStats.prototype.addVariable = function (v) {
            var ai = this.scale / v.scale;
            var bi = v.offset / v.scale;
            var wi = v.weight;
            this.AB += wi * ai * bi;
            this.AD += wi * ai * v.desiredPosition;
            this.A2 += wi * ai * ai;
        };

        PositionStats.prototype.getPosn = function () {
            return (this.AD - this.AB) / this.A2;
        };
        return PositionStats;
    })();
    exports.PositionStats = PositionStats;

    var Constraint = (function () {
        function Constraint(left, right, gap, equality) {
            if (typeof equality === "undefined") { equality = false; }
            this.left = left;
            this.right = right;
            this.gap = gap;
            this.equality = equality;
            this.active = false;
            this.unsatisfiable = false;
            this.left = left;
            this.right = right;
            this.gap = gap;
            this.equality = equality;
        }
        Constraint.prototype.slack = function () {
            return this.unsatisfiable ? Number.MAX_VALUE : this.right.scale * this.right.position() - this.gap - this.left.scale * this.left.position();
        };
        return Constraint;
    })();
    exports.Constraint = Constraint;

    var Block = (function () {
        function Block(v) {
            this.vars = [];
            v.offset = 0;
            this.ps = new PositionStats(v.scale);
            this.addVariable(v);
        }
        Block.prototype.addVariable = function (v) {
            v.block = this;
            this.vars.push(v);
            this.ps.addVariable(v);
            this.posn = this.ps.getPosn();
        };

        Block.prototype.updateWeightedPosition = function () {
            this.ps.AB = this.ps.AD = this.ps.A2 = 0;
            for (var i = 0, n = this.vars.length; i < n; ++i)
                this.ps.addVariable(this.vars[i]);
            this.posn = this.ps.getPosn();
        };

        Block.prototype.compute_lm = function (v, u, postAction) {
            var _this = this;
            var dfdv = v.dfdv();
            v.visitNeighbours(u, function (c, next) {
                var _dfdv = _this.compute_lm(next, v, postAction);
                if (next === c.right) {
                    dfdv += _dfdv * c.left.scale;
                    c.lm = _dfdv;
                } else {
                    dfdv += _dfdv * c.right.scale;
                    c.lm = -_dfdv;
                }
                postAction(c);
            });
            return dfdv / v.scale;
        };

        Block.prototype.populateSplitBlock = function (v, prev) {
            var _this = this;
            v.visitNeighbours(prev, function (c, next) {
                next.offset = v.offset + (next === c.right ? c.gap : -c.gap);
                _this.addVariable(next);
                _this.populateSplitBlock(next, v);
            });
        };

        Block.prototype.traverse = function (visit, acc, v, prev) {
            var _this = this;
            if (typeof v === "undefined") { v = this.vars[0]; }
            if (typeof prev === "undefined") { prev = null; }
            v.visitNeighbours(prev, function (c, next) {
                acc.push(visit(c));
                _this.traverse(visit, acc, next, v);
            });
        };

        Block.prototype.findMinLM = function () {
            var m = null;
            this.compute_lm(this.vars[0], null, function (c) {
                if (!c.equality && (m === null || c.lm < m.lm))
                    m = c;
            });
            return m;
        };

        Block.prototype.findMinLMBetween = function (lv, rv) {
            this.compute_lm(lv, null, function () {
            });
            var m = null;
            this.findPath(lv, null, rv, function (c, next) {
                if (!c.equality && c.right === next && (m === null || c.lm < m.lm))
                    m = c;
            });
            return m;
        };

        Block.prototype.findPath = function (v, prev, to, visit) {
            var _this = this;
            var endFound = false;
            v.visitNeighbours(prev, function (c, next) {
                if (!endFound && (next === to || _this.findPath(next, v, to, visit))) {
                    endFound = true;
                    visit(c, next);
                }
            });
            return endFound;
        };

        Block.prototype.isActiveDirectedPathBetween = function (u, v) {
            if (u === v)
                return true;
            var i = u.cOut.length;
            while (i--) {
                var c = u.cOut[i];
                if (c.active && this.isActiveDirectedPathBetween(c.right, v))
                    return true;
            }
            return false;
        };

        Block.split = function (c) {
            c.active = false;
            return [Block.createSplitBlock(c.left), Block.createSplitBlock(c.right)];
        };

        Block.createSplitBlock = function (startVar) {
            var b = new Block(startVar);
            b.populateSplitBlock(startVar, null);
            return b;
        };

        Block.prototype.splitBetween = function (vl, vr) {
            var c = this.findMinLMBetween(vl, vr);
            if (c !== null) {
                var bs = Block.split(c);
                return { constraint: c, lb: bs[0], rb: bs[1] };
            }

            return null;
        };

        Block.prototype.mergeAcross = function (b, c, dist) {
            c.active = true;
            for (var i = 0, n = b.vars.length; i < n; ++i) {
                var v = b.vars[i];
                v.offset += dist;
                this.addVariable(v);
            }
            this.posn = this.ps.getPosn();
        };

        Block.prototype.cost = function () {
            var sum = 0, i = this.vars.length;
            while (i--) {
                var v = this.vars[i], d = v.position() - v.desiredPosition;
                sum += d * d * v.weight;
            }
            return sum;
        };
        return Block;
    })();
    exports.Block = Block;

    var Blocks = (function () {
        function Blocks(vs) {
            this.vs = vs;
            var n = vs.length;
            this.list = new Array(n);
            while (n--) {
                var b = new Block(vs[n]);
                this.list[n] = b;
                b.blockInd = n;
            }
        }
        Blocks.prototype.cost = function () {
            var sum = 0, i = this.list.length;
            while (i--)
                sum += this.list[i].cost();
            return sum;
        };

        Blocks.prototype.insert = function (b) {
            b.blockInd = this.list.length;
            this.list.push(b);
        };

        Blocks.prototype.remove = function (b) {
            var last = this.list.length - 1;
            var swapBlock = this.list[last];
            this.list.length = last;
            if (b !== swapBlock) {
                this.list[b.blockInd] = swapBlock;
                swapBlock.blockInd = b.blockInd;
            }
        };

        Blocks.prototype.merge = function (c) {
            var l = c.left.block, r = c.right.block;

            var dist = c.right.offset - c.left.offset - c.gap;
            if (l.vars.length < r.vars.length) {
                r.mergeAcross(l, c, dist);
                this.remove(l);
            } else {
                l.mergeAcross(r, c, -dist);
                this.remove(r);
            }
        };

        Blocks.prototype.forEach = function (f) {
            this.list.forEach(f);
        };

        Blocks.prototype.updateBlockPositions = function () {
            this.list.forEach(function (b) {
                return b.updateWeightedPosition();
            });
        };

        Blocks.prototype.split = function (inactive) {
            var _this = this;
            this.updateBlockPositions();
            this.list.forEach(function (b) {
                var v = b.findMinLM();
                if (v !== null && v.lm < Solver.LAGRANGIAN_TOLERANCE) {
                    b = v.left.block;
                    Block.split(v).forEach(function (nb) {
                        return _this.insert(nb);
                    });
                    _this.remove(b);
                    inactive.push(v);
                }
            });
        };
        return Blocks;
    })();
    exports.Blocks = Blocks;

    var Solver = (function () {
        function Solver(vs, cs) {
            this.vs = vs;
            this.cs = cs;
            this.vs = vs;
            vs.forEach(function (v) {
                v.cIn = [], v.cOut = [];
            });
            this.cs = cs;
            cs.forEach(function (c) {
                c.left.cOut.push(c);
                c.right.cIn.push(c);
            });
            this.inactive = cs.map(function (c) {
                c.active = false;
                return c;
            });
            this.bs = null;
        }
        Solver.prototype.cost = function () {
            return this.bs.cost();
        };

        Solver.prototype.setStartingPositions = function (ps) {
            this.inactive = this.cs.map(function (c) {
                c.active = false;
                return c;
            });
            this.bs = new Blocks(this.vs);
            this.bs.forEach(function (b, i) {
                return b.posn = ps[i];
            });
        };

        Solver.prototype.setDesiredPositions = function (ps) {
            this.vs.forEach(function (v, i) {
                return v.desiredPosition = ps[i];
            });
        };

        Solver.prototype.mostViolated = function () {
            var minSlack = Number.MAX_VALUE, v = null, l = this.inactive, n = l.length, deletePoint = n;
            for (var i = 0; i < n; ++i) {
                var c = l[i];
                if (c.unsatisfiable)
                    continue;
                var slack = c.slack();
                if (c.equality || slack < minSlack) {
                    minSlack = slack;
                    v = c;
                    deletePoint = i;
                    if (c.equality)
                        break;
                }
            }
            if (deletePoint !== n && (minSlack < Solver.ZERO_UPPERBOUND && !v.active || v.equality)) {
                l[deletePoint] = l[n - 1];
                l.length = n - 1;
            }
            return v;
        };

        Solver.prototype.satisfy = function () {
            if (this.bs == null) {
                this.bs = new Blocks(this.vs);
            }

            this.bs.split(this.inactive);
            var v = null;
            while ((v = this.mostViolated()) && (v.equality || v.slack() < Solver.ZERO_UPPERBOUND && !v.active)) {
                var lb = v.left.block, rb = v.right.block;

                if (lb !== rb) {
                    this.bs.merge(v);
                } else {
                    if (lb.isActiveDirectedPathBetween(v.right, v.left)) {
                        v.unsatisfiable = true;
                        continue;
                    }

                    var split = lb.splitBetween(v.left, v.right);
                    if (split !== null) {
                        this.bs.insert(split.lb);
                        this.bs.insert(split.rb);
                        this.bs.remove(lb);
                        this.inactive.push(split.constraint);
                    } else {
                        v.unsatisfiable = true;
                        continue;
                    }
                    if (v.slack() >= 0) {
                        this.inactive.push(v);
                    } else {
                        this.bs.merge(v);
                    }
                }
            }
        };

        Solver.prototype.solve = function () {
            this.satisfy();
            var lastcost = Number.MAX_VALUE, cost = this.bs.cost();
            while (Math.abs(lastcost - cost) > 0.0001) {
                this.satisfy();
                lastcost = cost;
                cost = this.bs.cost();
            }
            return cost;
        };
        Solver.LAGRANGIAN_TOLERANCE = -1e-4;
        Solver.ZERO_UPPERBOUND = -1e-10;
        return Solver;
    })();
    exports.Solver = Solver;
});
//# sourceMappingURL=vpsc.js.map
