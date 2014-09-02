



import Data = require('./Data')
import Recorder = require('./Recorder')

import Util = require('./util/Util')
var log = Util.log
var print = Util.print
var line = Util.line

import Ansi = require('./util/Ansicolors')

/**
 * Generate up to `n' other values of similar shape as `init'.
 * The value `init' itself doesn't have to be returned (but can).
 */
export function generate(init: any, n: number): any[] {
    var type = typeof init
    if (type === "number") {
        return [0, 1]
    } else if (type === "string") {
        return ["b", "def"]
    } else if (type === "boolean") {
        return [true, false]
    } else if (type === "object") {
        // TODO better strategy
        if (Array.isArray(init)) {
            var res = [[]]
            if (init.length > 0) {
                var oneless = Util.clone(init)
                oneless.pop()
                res.push(oneless)
            }
            return res
        }
        return []
    } else if (type === "undefined") {
        // TODO better strategy
        return [undefined]
    } else if (type === "function") {
        // TODO better strategy
        return []
    }

    Util.assert(false, () => "unknown type encountered: " + type)
    return []
}

function categorize(f, inputs) {
    var map = new Map<string, number>()
    var res = []
    var cat = 0
    for (var i = 0; i < inputs.length; i++) {
        var input = inputs[i];
        var skeleton = Recorder.record(f, input).getSkeleton()
        if (!map.has(skeleton)) {
            map.set(skeleton, cat)
            res[cat] = {
                id: cat,
                inputs: [],
            }
            cat += 1
        }
        res[map.get(skeleton)].inputs.push(input)
    }
    return res
}

export function generateInputs(f: (...a: any[]) => any, args: any[][]) {
    var candidates = genCandidateExpr(f, args)
    var allInputs = generateInputsAux(f, args, candidates)
    var categories = categorize(f, allInputs)
    return {
        all: allInputs,
        categories: categories,
    }
}

function generateInputsAux(f: (...a: any[]) => any, initials: any[][], exprs: Data.Prestate[]): any[][] {
    var helper = function (ps: Data.Expr[]): any[][] {
        if (ps.length === 0) return initials
        var res: any[][] = []
        var p = ps[0]
        var rest = helper(ps.slice(1))
        for (var j = 0; j < rest.length; j++) {
            var r = rest[j]

            // one version where everything is unchanged
            res.push(Util.clone(r))

            // skip if we can't update this
            if (!p.canBeUpdated(r)) {
                continue
            }

            var init = p.eval(r)
            var vals = generate(init, 3)

            for (var i = 0; i < vals.length; i++) {

                // skip if the update would be a noop
                if (p.isUpdateNop(r, vals[i])) {
                    continue
                }

                var nr = Util.clone(r)
                p.update(nr, vals[i])
                res.push(nr)
            }
        }
        return res
    }

    // order the expressions so that less specific updates happen first.
    // for instance, if we want to update both args[0] and args[0][0], then
    // we should do args[0] first, because otherwise we might update args[0][0],
    // and then update args[0] to the empty array, thereby losing the update
    // to args[0][0] (and thus creating equivalent inputs)

    // of course, this is just a best-effort mechanism;  if there are aliases,
    // we might not do the right thing

    var sorted = []
    var worklist: Data.Prestate[][] = exprs.map((e) => [e, e])
    while (worklist.length > 0) {
        worklist = worklist.filter(a => {
            var base = a[0].getBase()
            if (base === a[0]) {
                sorted.push(a[1])
                return false
            }
            a[0] = base
            return true
        })
    }

    return helper(sorted.reverse())
}

/**
 * Return a list of interesting expressions that should be used during program generation.
 */
export function genCandidates(inputs: any[][], f: (...a: any[]) => any) {
    var res = []
    for (var i = 0; i < inputs.length; i++) {
        var ps = Recorder.record(f, inputs[i]).getPrestates()
        res = res.concat(ps)
    }
    res = Util.dedup2(res)
    return res;
}

/**
 * Returns a list of interesting expressions that should be modified to get inputs. Unlike genCandidates,
 * this method performs some filtering of things that aren't necessary for input generation.
 */
function genCandidateExpr(f: (...a: any[]) => any, initials: any[][]): Data.Prestate[] {
    function filter(input: Data.Prestate[]): Data.Prestate[] {
        var filtered: Data.Prestate[] = []
        for (var i = 0; i < input.length; i++) {
            var e
            if (input[i].type === Data.ExprType.Field) {
                e = <Data.Field>input[i]
                /*if (Array.isArray(e.o.getValue()) && typeof e.f.getValue() === 'number') {
                 filtered.push(e.o)
                 continue
                 }*/
                if (
                    Array.isArray(e.o.getValue()) && e.f.getValue() === 'length') {
                    // we always vary the array length, so no need to kep this
                    // but make sure we have the array itself
                    filtered.push(e.o)
                    continue
                }
            }
            filtered.push(input[i])
        }
        filtered = Util.dedup2(filtered)
        return filtered;
    }

    var first = Util.dedup2(Util.flatten(initials.map((i) => Recorder.record(f, i).getPrestates())))
    var newArgs = generateInputsAux(f, initials, filter(first))
    var res = genCandidates(newArgs, f)
    return filter(res)
}
