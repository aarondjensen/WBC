import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { _app, _db, _auth, onAuthStateChanged, doGoogleSignIn, doAppleSignIn, doSignOut, consumeRedirectResult, deleteAccount, USERS_COLLECTION, NATIVE_APPLE_ENABLED, APPLE_PROVIDER_ENABLED, isNativePlatform, isAndroidNative, AUTH_PROVIDERS_ENABLED, TOURNAMENT_ID, getEditionSlug, getTournamentYear, isDefaultEdition } from "./firebase";
import { readMembership, isDirectorAccount, resolveMember, joinWithCode, readAccessCode, setAccessCode, setDirector, subscribeMemberships, accountsUnreadable, membershipForPlayer, playerIsDirector } from "./lib/accounts";
import { K, ON_ACC, ON_DANGER, FS, fsStep, R, ALPHA, MOTION, FONT, SHADOW, SCRIM, DIM_PLACED, getTheme, setTheme} from "./theme";
import { SegmentedToggle, Toggle, StickyTop, SectionLabel, Card, Toast, Btn } from "./components/ui";
import { calcCH, buildStrokesMap, computeRoundLine, computeIndividualBoard, rankIndividualBoard, rankIndividualBoardIds, WD_SCORE } from "./lib/individualBoard";
import { fieldFor, potFor, perUnit, computeSkins, allSkins, skinCounts, lowNetRounds, lowNetRoundField } from "./lib/sideGames";
import { teeTimesByPlayer, roundInPlay, thruStatus } from "./lib/thruStatus";
import {
  MARKET_OPENING_SHARES, MARKET_MID_SHARES, marketWindows, normalizeLots, totalShares,
  countdown, countdownTick, countdownTone, openingSharesLeft, midRoundFor,
  sharesOn, setLotShares, lotsFor, allLots, marketBoard, marketHoldings, marketPayouts, roundComplete,
  eligibleBets, rebuyers, marketRoster, teeOffAt,
} from "./lib/market";
import { BuyInPrices, BuyInTracker } from "./components/BuyIns";
import { useConfirm } from "./lib/useConfirm";
// Tee times survive a re-group because of these two — see lib/teeSheet.js.
import { rowsToTeeTimes, mergeTeeTimes } from "./lib/teeSheet";
// Score documents → the holeData map, deletions included — see lib/holeScores.
import { applyScoreChanges, roundOf } from "./lib/holeScores";
import { useDirtyForm } from "./lib/useDirtyForm";
import { useSheetDrag } from "./lib/useSheetDrag";
import { usePullToRefresh, hasNewBundle } from "./lib/usePullToRefresh";
import { NotificationSettings } from "./components/NotificationSettings";
import { registerForPush, getCachedSubscriptionStatus } from "./lib/notifications";
import { pairingScoreImpact, orphanedScores, describeScored, totalHoles } from "./lib/scoreGuard";
import { groupsForRound, assignToGroup, removeFromGroup as removeFromGroupPure, clearGroup, swapIntoGroup, rowsToPairings } from "./lib/pairings";
import { fitPairings, rungLines, nameWidthCeiling, CARD_GAP } from "./lib/pairingsFit";
import { Popup, ConfirmModal } from "./components/Popup";
import { EditionSwitcher } from "./components/EditionSwitcher";
import { docIds } from "./lib/editionId";
import { isHistoryCourseId } from "./lib/historyImport";
import { openingHole, nineComplete } from "./lib/holeAdvance";
import { scoreWindow, nudgeUpTarget, nudgeDownTarget } from "./lib/scoreEntry";
import { groupTrouble, roundTrouble, describeTrouble, blocksScoring, missingTees, describeMissingTees } from "./lib/roundSetup";
import { indexFor, matchHistoryName } from "./lib/handicap";
import { groupKey as groupKeyOf, sameGroup, liveRound, roundFinalized, switchableGroups, groupProgress } from "./lib/groupSwitch";
import { groupTeeOrder, tagAheadOfPlay } from "./lib/ctp";
import { AppHeader, HEADER_SAFE_PAD } from "./components/AppHeader";
import { GroupSwitcher } from "./components/GroupSwitcher";
import { OffRoundBanner } from "./components/OffRoundBanner";
import { MoreMenu } from "./components/MoreMenu";
import { PlayersView } from "./components/PlayersView";
import { PhotosView } from "./components/PhotosView";
import { photoUploadsAllowed, uploadsDisabledReason } from "./lib/media";
import { returningPlayers, returningLine } from "./lib/returningPlayers";
import { TROPHY_SVG_URL, WBC_LOGO, WBC_FAVICON, DEFAULT_NUM_ROUNDS, ROUND_CHOICES, clampRounds } from "./constants";
import { collection, doc, setDoc, getDocs, query, where, writeBatch, onSnapshot, deleteDoc } from "firebase/firestore";
import { getMessaging, onMessage, isSupported as isMessagingSupported } from "firebase/messaging";

const WBC_TROPHY = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIoAAADgAgMAAAChhhbLAAAACVBMVEX///8i06f///8qYg9HAAAAAXRSTlMAQObYZgAAAAFiS0dEAIgFHUgAAAAHdElNRQfqAhwPCRGrKvWFAAACeElEQVRYw+3YW3LdIAwAUPHBDsp+9NN/dQb2v5WaxzUgJFCapNOkZvK8PmM9kO2bAAwrpNdCUFYnKhpJSpJwiS1aTVrWEs6vJu2TkU16zH9pwj8W6zGKyQdRNfVo/kqqScWknfHdxK0huD6casL1mQ3uTD5yGdgZehkwGr81aDNJNXibIJrYDJbTec1E6AZl46ibq0GiycdyMsUk2ZRHxhvMtW9Sn/1tojKptbJuZBRhMkp/jobeZtL7jSuDU3/cGffpBuuBsleaqWX5bmBvcG+wzuLOlMOelBuZ3aS7OJvxW6MMRzQbZzGxn+1kcGN8M/ROE2j4przPbMbvTJuKGlIzMJQnG2cxbUcgikNGQ+mvmLJpF3S+9WqmDXIb64OpU8ZNmeP72VyT/1MTXmW14kVDt0kGEyQz7OjdoLAaN7wtKd0UjO+hamGCCaNJ68bHOZ32i2AGUrdl2S4XR1NvaNz4yTjZ0GhgLQxba/v6YTBBMnE2eRRnc704p1OSXgyejWMGuMlPG0ZyYZ6Z5f3qlbSbjYuLobO5XmGG7QTUOZi3Kywkz/RYGJbt4cGQGRIMzcYJBub3Uu1mwg1OJkgG4mjW7tQTDQ2KYqir9F9sNoTF+iwvNqpysGOoOZhm4JzOGIwMBlXjz6F60nqonvTO+FPlRuOOKd8J0daEQ3fuhPanqQnhY76dgQ86zxczYKi9XDwfYf5iny3XsuWeYDCGe1R/yBmIhhJbeip90T6QlnhIx2Dq3++7UEIwwXzW/2mdZPAxb+nhYx7zpQ3OxHJdeMnQbIJk4jc1rHaxP6yHlr0wPS8sz6b1RARnhIKZ0/4J8jqdZBo0Jn4DUtjOuhjt96MAAAAASUVORK5CYII=";

const WBC_TROPHY_SILHOUETTE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAlgAAAJYCAYAAAC+ZpjcAABOvUlEQVR42u3dd5hsaVnv/e9dVb0nMwOSgwoIiDMkBTygIAiCR+EwHLOCoEccMCAHE0mGgUFARFQ8KLwioKKASlaQnJNIUEaCpBnCMMwwOe7uqvv9Y91ratF0V1Xnqu7v57r6qr27q6qrV3p+T1jPA5IkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkXS3cBJKmycwAegfxT4+IkUeAJAOWpI0Gp9X6nWtDAhERywd4Gy2122GNHw/rZ80FNSI9qiQZsKSDGRboBILlGV93FHDbCUGjG86GwCnA7YAR89Xy1X6e/wae3fm83/Qn1995bkR8bivbGFgxeEkGLEmLG56iAkM3JIw6YSrXeM01O6/p1fN/ocLUCBjU462B7zmAm/VC4HWdbbM6qL0Q+I/25xFx3oR909XrXH8zIoYewZIBS9Leh6neqsKaiFiZ8pol4JGMW5R6wO8Cx/KNLVNL67zFQQwB/Rmes9wJXK8D3levW6lt+tyIuGzKvhmsCsZZwcuWL8mAJWkXQlWfpqVkuE4hfe/Ot64H/F7n/0vAt87wq0Z8Y2tNe63oH8TNPiVYDmZ4jy8BV9U2XKnt+BLgvfXvSyPinRNCMRW2VjwLJAOWpO0JVL21CtbMvHmFoBsBj6t/X5/p3XjLawQErwPbE8SiwtjqcLo0w+v/pV7bB14GvAu4PCLOWSdI260oGbAkbSBURZ2X0Ragmdne1ff9wA8DxwG/ss5brA5jvSn/184brRPIsrNP1tovX6UZ49UHPgn8TQXuw53j4ur3czoJyYAlae1gNeje1ZeZtwVOAv4vTdfetRh3SXXH5gw753PfrbmQVlaF4Fjj+vy12tenAl+IiDetOoaW8I5FyYAl6eqCcdB2A2bmscCPAw8Dvgs4YdXTl+u8Hbjl9v+h0Qlefb65leu9dSw8CTgrIj5Zx1DP1izJgCUd5GDV3v03ysyTgN+gGUN1h1WBqjvxp+fswQ5cMB6r1T0WRsALgCdHxJcMWZIBSzqw4aotADPzFJq7/W7UKSyTb5wrSVodtkad63jbunUVcFpEPC0zlw7yDPySAUs6oOEqM+8L/Clwy/pR21rlQHRtJnCtML5j8UPA9+JcWpIBSzog4aodhH4i8AHgyApWTpeg7Q5a/yci/qo7xk/S7rGmLI3DT2/S13b9mpp+4bcrXB2uwtBwpe2qNLfL+jw6M6/bHNoZC3Yuej5oX5yM0sIEIHZwGoJp41W22hLQ6Ro8CfhwFYROq6Cd0A6Ef31E/Ehm9jc7MWlnjcvdKi+GdZ50J2h1+gktHG/11uLUBppB4Tt2Z1Rm3pSmVWmtisgFEXH2Fn9Fvz7/L9a5t2LA0g4aAcdvw3nXnS5itypTR0bEle5CGbCknb3Yti0/dwR+nvHCutuW3WjGrvwycMQ6z/laZj4feOo2XPgvxdZj7bwe37w00kbPvT5NF/aDgdvswLm31nl4I+Ammfn+qoBcBjwpIi7PzLAlSwYsaRszVj3+I/Btu1Drj87vbP99HeAJwNeBP97iLfCGK+2WI7dSsanz4e00dyTutjutugb8bpVZTj0hA5a0LdXacY21XxfXnapFDzrvG6sC0YhmXMtjMvMlwHlbqE173mnHT5t6PG1VJWUz73NCHf/tNCK5C5+9V+fbMnAIOMpdKgOWtHNGNN0VO9lNsZ52Qd7rAYciYit3Zl3MDo4lkzrny2e3WLkZZeaVdewv7fJ51+uUU54vWjhO06BFrJXvdaG1qc/R6VJ8JnBOFViOJ9FOXt+P2cwLq3swM/MOwPW3ctxLBixJs4a8S7f4HkOabg9pJ2Qdp2cBF1RL60aDfL+6v3+QptV2aMCSDFjSTmkLmUe3hdAmWgai3uPsTmEobaeVOsZeFRFfAAZbuPPuMo9RyYAl7UbLAMB31+NmavT9ms/r1Hq/oZtVO2RpG2ZEdwknyYAl7ZrLtuE9jrTg0g5VApbqGD1tGyYJvcJNKhmwpIUoAKtV4VzGE47aBaPttkJzt+pmDtAAVjLzGOA369uuOCAZsKSra/LDepz2tVFHZOampjip9eB6EfEm4EN4C7p2xjVoWrLY5HGaNDdi3KL91gZePtqBc04yYElzortA7bSvWS/47fqB9wPuEhHLtZTIZlsJ7CLUdmvD+r8CV9V0C5t1GZvrIuxt4zknLSwnGtUimWVAeHYKh3cAjwMOr1MIjGgGrL+k3nvWsNRni10mNVHpce5S7UDA6gMviYirNrmkUxuATmL2udqyfvdhmiVt3lSfY7jGuTOkWfbqxA2ed5IBS9ohx2+ggPlURNxvaqnQtEBdzvqLPE8qhDarLbCeDfwNtmRpb86VSRWIEfAompsxlpne3Zj1uq9ExHNmOO9OA17usa/9zC5Czb1ON8fLVwWUiZWHzGy/eut8HQH8F/CqKhw2crfVpdvwp70Xu0q0M7Zj+o/N3C0bmdmvr7XOuUGdzx/cZKVEMmBJO3Cc/uMGLrYZESvAKCLW/KqfbfTC3da4v29CIIz1vlY99QRr8NpGI5peiU8Cf1NBZmWDx+TVxzCb6+E4om7kmHTOjYBjZwxVA5q7IZ9e31txN8uAJW2/4+fgPGgLpEe167V1CqVBjXnJ9b4ycwno112InwJeU7/fgkPbIYDDEdG2PvWhGfO33lcdu98wKWl9fzMtWGeuOk8mhcFZ/54RcL67VovGMVhaJDs16/mVm3jN+RExagumiBhWi1k7ruvItX5PO+C4gthlmXlmp7YubUuFoY7BXt3pGsDRazwvmywVl3WOy0E93gi4N+OxVdO0i0Gf2qm0bOf0I0s0Y8EkA5a0ANpWoycCD5rxfGhr1NfLzJMi4uNXl1aZp1SB9DDglvW8tpUrgP/OzOfX9/5qxpq+tFGHq5tumJn/G/i/wG07x2M3FPUy8+3APwOvi4iv1LF8XZq7/Fa/Ztq5ccwO/U1WQGTAkhbQFcx+q3hUTfqGwD2qxn974HeAW0957fcAz6t/PyozHwdc26ClbfYPmflM4IeA283w/P9VX1/OzBcCb6hzYjjjcdlWIC4AvlYtZgYiHXhe1DX3MnMQESuZeTLwSpqWp/UqB+28Oh+NiDtkZq8G1a71vlHjoq4N/DfNoPON1KY/Ctyh8/22C6O/zrnVXdx5yT2rXTCa4VrfHpfdY/KjNK1es7RetefjayLiAe35us4516uu9VvT3ME7qYWsDW7nAzeOiCvac9bdqkXgIHft21w2tXZRg84j4jzgGatC0rSKSXTC1bAKiqX6Wm8m617nOSPGS/lI233sDzvhZdrM6r1Vx+SQplV2o+XDNde7K3GLjrExQAYsaedr49MCSTuf1YmZ+dNVW56lK7y/hc/T38S51GP9li5pK2KLx2Q70ehGfh/AB6p1absqDe37/DvN4tOeKzJgSTvkKGYfE3KI2aZ1aC/i5wJXbTDw9AxIsmy4+rnPWnVOzXLeTdJ2pz8nIg4DfbsHZcCStteo5pz6d+AzzH4L+NS5pWpsV0TE84ELacaSjNzk0oasABtZW3MjYxCPdfPKgCXtgBqk3ouIzwCfZTz1wdSXzvorqvvhrfW+1pKl2SzXefZXwOdqTONohjLnafU4y7lmhUcGLGknVQg6tANv3XY9/FUVFgYsacbKCU3X+sdr7q1Zz51ruOlkwJLm5Uq+vQNou1aqC/K/gf9g44N8pQNZ56HpUl+JiOfUOTrrkk8rG/gdVnhkwJIW8fiu4NaLiDOBL9UF3YAlTdaeI2+tdTg3s6bnLM87wk0tA5Y0Xy7dSGFRXZBPZzx3kKS1tS1L5wNPrZar2Ob3D+AS4AvODi8DlrR7teZJ2jmtfjUzj6BZk23axb+dz+r9wBvr4r7i5pbWPQ8HwJci4gOZ2a8xWNv9/p+MiDfQtDAP3ewyYEk7Z5ZbwdswdUdgMMvcOe34rohYBp666n0kfbMh8PKNTgBaz5/1NQMnGJUBS9pZbUh61wbCz2VsoFshIoa1Vto7gbfRtGhZa5a+Uduy+5qIeGpVYoYbOM+S2Zakoio9dg3KgCXtQsD6kw0ErM0c373M7AOnd2rpksYGVfl4crUuzXSO1Hk1zMy7A3eq11kGyYAlzYnjd/IYb28zj4i3AY+mmXdr2c0uAU3r1Qrw4oj4KM3YqNHsp1ckcIM6jxO74WXAkubGRlqUErhiE78jq7b9YuBzNMt62JKleZe7cO4NgLMj4qE1LcNmpjM5vIHP6nknA5Y0h4XNEnCrtvY86wurRp4RcT5wD5r1D518VPNuJ6cyGDGetf1X2jmvNjk+aiOD3I93t8qAJc1XQbMCHAM8qr7X39AbRIwy81BEfBE4jWa+n6EhS3PqCpp532IHjtFRJxQ9ICJe15wisdnfs5Fy54/dtTJgSfPp8k2ntIjDmbkE/D3wUzQtYpvtFplUeNkNos1qVx24APgj4MJtDlntBKLLwH0i4l9rQeetHLMbmQD4Xe5iGbCkHVQtSgPgs4wXZV7Z6WO85sUaAe8Bbg+ctY0hK+u9+u5hbeEYahdBf1ZVBJY74Wgr77tMM+ZqGTg5It5c4Wp5C+8J8L3t6TXDa45zF8uAJe1KzorlqqV3L9g7/UszIq6IiI8BdwX+rXPuLLPxgffLnQLmfcAzaMa22P2oTR2iwKURcXFEvBE4ub4/YHzX36xWGHcJLgEvBO4cEa/PzMEWwhWdVq9HbaD88ZyQAUua0+N2224Dr0lIvxwRdwZ+tULREuMJSdvuvklfbcG1DPxeRNw1Ih4DfIrt737UATonMjOqhen1wL2Al1XIGsxwXA47oawHfAH4tYj4xYj4WC2Fs11LR12ygcqIk4xqYQ3cBFpAR27guYe3rZmg6aZs7556bma+EngicFPgvht4qxcCp0XEmdXtOcL5gLTF/N/OkF5h6O3A2zPzc8DNaLoOp1kB/hb4CPCCiLisJhLd7nUAZ60ghWWUDFjSLhUi9fhZxq1Bk47tEfCgzPwz4AvVArWlFqL29fVeZwOPqP/fEbgPTffMkG8cV9V+7tOAMyPijPY9gFEFN/eutuVaXks+9evYelwda88Ebgc8fNXx2R54TwLOao/Nes2gWq22LVzVMT+tMtHO8P564GNVCfFGEC0ca81anHSVGRGRdZE+D7gmk2eDHtWF+qSIOGM7Atbqz1MF28pG5gOqOxNX2r+lAtZHqwAcYde9ZtceL5+IiO9a41gb0LRuDTdwbCYw3Kk1ADPzLOAmE87dlTqvXhQRv7DFgfXS3td6pAVy1AYqB+1t7NtfOxl3yUS1GMz0edYpLI5xt2oLAesJbaDqjpVq/z3j8Zk7FWQ6FYm7Atdgtm7xparESAYsaRcLlVm7DIIdngahgtZWuzA+DHyHu1abtDzlGN3rLrZ2JYQH0szOvkxzs8ckbSuve1cLya4ILaJgY0toXDjnfwvAH7SVfXevtnAczbtLNnCMu0yODFjSrpQg4/FXh4GX17cndf+1F/IHLUAhdKx7WAfAYIbzsEfTIvyyGc5xyYAlbdcxW+NKXr2Bi++PL0DAshDRQXDFjOXSCHiV54YMWNLuO47ZuxoudHNJe6MGqq9k5nWoaU2YPv53RDMYXjJgSbvsCGZvkRp4N5L2e46Z5w9XN4IcQTM9AzOcu0e4S2XAknbXqMLSR4Bz6xieVrgs79ScPtKcWIQ7wmeZMqX9+buAy9uVEyQDlrTzNeERzTis9wGfZ3z795pPr4v6tTPz2kDakqX9VNmo4/99wJtrrqt5nvF8ZYYyp/38L42IS4G+lSMZsKTdrAo3NdulGY7vIXB74F41F1B/Xv8knKJBGz9mArg4Ii5p6h9zHUa+ZQPPdfyVDFjSXqiWrFlr68mUiRjnwBIuXaXNmfcxhm2l5sn1uLIPzlfJgKV9bda5o4Jm7qx51M7tdQ7wZcbdmtLMx9CCdKP1NnC+Hu1ulQFL2jtP28Bzb9KpHc+NaonrR8R/AW9l3K0p7TfTBrgnzWD9rwAvbqd3cLPJgCXtvo/O8Jy2e+LUCjRzGV6qMDnSXaodCC7zcHz3mH6nYzum7LKIOKvOV1tzZcCS9sDRGyhclud5nEoVJBYm2ux5MK/Bql8rL9wV+BGaFqlpQavn9AwyYEl7a7CRY9jasPapTy7AZ1xi+l2/rX51nUsGLGmXjWrOn08C72G2cUv9zHTgrPbj9fsp7Xkxx591I5Wbi9y1MmBJe6BaonoRcR7wCSbfeRc0t3xfH/gtgMxcmtM/zVq7NmMRKg7DDRz/j28rRe5aGbCkvagSN2OqZp2QcBGmPzjWvap9Fszbc+70Gcsc58CSAUva6wt3tWSdzfjuo0nhCuBbMnMwh0Grrd0/uz6bNXftp4pQD7jRBipC3k0rA5Y0B6HkyTR3Jk0KJe1dS78BXC8iVubsjsI28P37DGFRWuvYmVs1YP3yKU8bVXn0KeDjFcrsMpcBS1qgY3ieW4eOcXdqo/llXq/jFZIyM28JXKsCU0wJWJ+IiM/RjLE0YMmAJS3QcTzPdyhZoGjm/FKP5wJXzOkcb/3qxj+ZpotwyPTW2aU5X1dRMmDpQBU0l8/wvDa8PMxjX/vASoWVF0bEmcBgjlt8Lmf2rszjnK9OBixpD0VE1nQL5zNek3B5hoB1n6ohW0vWfnBoAT7jLC1X7c//uVNxkgxY0l4GLTbWtfY1a8jaR+byWG4Xas7M44HfqW/3ZyiL/sqAJQOWND+Fy8WMu0zW06+a9D0z80RgOKfrnTkOS/up8nMZ4ykaZmk1PsEtJwOWtPcX8JXMjIj4c+ALNNMxrBdQ2olGbwjcuC7+MYfn48A9q31UtjywzrtZKw5DN50MWNJ8OWLG5yXNuK25Uq1plwMfr2/ZkqVFDiS96ib8cZpxYpOmaGhbn/8f8MXMHDhFgwxY0vw4a4bntIPbH98JW3uuWtP6EXEh4zEo1uQ1i2vM6wfrrLQwS6UH4OKImNbVLxmwpF3SDpw9leldEe2F+3ZzPNeO6xFqlkDSp2nxfGl9b25afKo1dpiZNwbuXZ93ljUIbbWSAUuaQ0dvoOZ7yRzfSWjLlWa9dl8ZEW+bt4AFRHXx3Qg4cUrASmAJOA94er3YxZ5lwJLmo8KcQTOj9QWMB7NPqikfl5nXrxfPW0uWg9w1c5DJzKPn+POdt4Hgt8JsEwZLBixpl6rKQ5rxS+8H3sF4Oob1jvcV4NuBn6ta9rwFmkuwFUuzm8tutaq4/Eadc7O0Fh/PfK8TKhmwdDDVBf2EWZ8OXDFnQbHtFvkT4Ms03SaOSdG043heKz4JfN8GAuKrmd+56SQDlg5uQVMX9H9rr+8Tntuvnz82M0+gmW16broJvT1dGzB3y+TUuZSZeUOaqVOmzTfXttb+Qx37lkkyYElzWJP/w6oRTzqu24v9dZnvwe7StOP9q4zHIM6LfgWl/0kzwH1lyvnYA67s/E2ejzJgSXPohBmO6WDcLfEzVTjN23lgK5YmaVt9nhwRV1Wombdgcu4MYWlIMwbyQxHxqszs15hKyYAlzUuNvsZuXACcMUNIGdJ0r/xQO8nnnP09R7lLNYP+nJ6LAdyD8cS+0xzjrpQBS5pDnZnQz6WZeDGYfCdeu2bhfTLzlsDyPAyu7XT1fMa9qgU9F9vKyykzhMC2NfnJbjkZsKQ5VgHlBrOUA/V4feC4OVr4uS2MnlKPdhVq3cOdOR2vVN2WF26gDLJCIQOWNMdGFZTeSDNh4SzHdgJXzeFko0e6OzVDJeGIefpAbStwZt6dZo3ESRWEdvHnM4CL6rUOcJcBS5rDWvOwHl9dAavP9BndAzhtDgcIW9Bo2nF7MXBmOy3CnHy2dtLe/02zpuakhZvbgPXmiPgi47sPJQOWNJelT+Yh4PwNFFa3mPPlRqTVwWQAfCIi/hXozdGdd6PMHHQqN7OULzeY44XXJQOWVOFqEBGHgVPrAr8y4en9+vlJwP+OiGEVDtIiGMxTMMnMXkSsAN8G/Fr7GSdUbHrAVTQTjCaON5QBS1oIRzD7oPUALpuHDx0RKxXy3gi8qwoo5wXSmiFlTifJnfVc6tEsB/Wq+r8BSwYsaY61a5m9HvgPxtMxrKe9a++3qzVgLsJMRFzJnK2VKK/d0w7bOoceN0NgGtK0Yv0x0KuWZ8cdypNUmlftdAsR8bW6iE8bANy2cp0EHDVnF3nPTU1yxfydfpHALev/k86ldoD7mdWl77EuA5a0CKom/WamdzsEsAwcDTymXrs0J3+GXYOa5LFzdL71aAa4fyvNPHST1gNtV064ADhjnlqOJQOWNL0qncAL6vieZSxWn2Y8yDw53j2pCS6fp3Kkplg4CbjtjAHrqxHxluZ0df1BGbCkRTDKzD5wHk0r1qw15GPmpPWq7Vr50zYvuks179fuasU6mtkHq18yD8tTSQYsaUaddQm/DpzFeL2z9SxVqPk14FoRsdfrErYB650GLE061OfoswyrBev0KlMmnT+jOsYfU6/x+JYBS1ogoxrb8V/ALINo29mx7zxHhddx7katskLTvfYK4GN1992edq+1c3Fl5i1ourVnWdczmLwItGTAkubUsFqyngMcYvqyOW0L16PnKGA5L5DWc1EtqDwPx+lSnWv3p1k8fXnC5xrWufhe4MPVle9xLgOWtEjq4t0HXl7hapYL+WX1urn4E/DuKs3xdbtar1Yy8zjgR+qYHUw5pgE+HxHnM57aQfJElRZBZxzWFcBbmT7QfUDT/XIf4C6dGdX34rOParD954DnM55KQmodOUfnWjuO6l712JtyngVwutMzyIAlLa52sPpraAa7LzG9FWsJOKlet6c16xpbc7m7Ud3Doo7Lz9T/97r1p19B6TFVQZkUmNrP+iXgXHelDFjSopZE1fUQEWcD5zB9vEp7LrR3N408PzVH2vmjloGn1/f2ugWoV+fZTZi+LFXbCvviusN3ye5BGbCkBc5ZnfXRpo3DaqdzODoz7wxXz+2zpy0E7kKtYc+7CNsuvsy8EXCrTgCcdCxfArxnTsKhZMCStpSwmlryrLeOrwDXAX6gXjfYo4/dFj7PBC6uz2FtX1fnm3koO6ob+7rAnZht9vZLI+L1dV4asGTAkhZYO6v7x4D310V+0oW9nXT0Z+vOqOV2np89KkDPrtDnZIzqVgTmI+U1LbyPZLbu9ATOm6O7dCUDlrTpkqhphYqIOA/4/Ay1/6iv2wNHz8EYkUPuRa2uNMzR+TUC7jhDOTKs8+qpETHcqzt0JQOWtL2G1Qr11LrIT7u4r1Qh9rj6/14WBgkc4S5UHZfQDHC/IDP3bJB4e5dtjb86qs6XmHAMB/BV4PN1LtrdLQOWtI98labLDaa3YvWAW2bmsVWQ7Hq3TKcgOnOGz6yD48JqOdrrcqMHPBy4OU0L1XplyYima/4LEfFBmvnpHH8lA5a06KqWv1S3hr+wvj1p4s52nNYPAzeNiJXdPk86E6VeBfx+fdtCSXt+zc7MiIiVOi8eyfTZ29uKwovmYX45yYAlba82nLyf5q68WQbaJvDDczBVg+Ow1LXXXca9Clr3ZPoan92Q9YZqeTNgyYAl7Rdtl0REvJZmLMssBUMAvzAH3THeQaj2OLiC2W7W2I0y46eBY5h8l2v7s78Fzs3MwRycT5IBS9pOmdmv1qg/r2+NppwXQ+A6VVMf7eHt5ZfhWoQH3YimG+6siHhp2023d6dSHuoEvN6Uzx3A5RFxueWNDFjSPm0BqNrzu6twmDbQfQRcm2aWatjllqRacLoPvJxmHq8lHId14I/hveyyrt89BK4P/DKTx1+1k4teAbyhvufxKwOWtA/T1UrNv/Nu4MNVMEy64Lezp/8WzazVK3txN2ENeLdgEsARe9zFFnU83onx4PWp5UtEvLL+b/egDFjSPg5alwKf3sDF/obADdqX79HHPsE9J+BLe/WLq3IRmXkN4FSmtwK3k4v+ZWYuZWbfxZ1lwJL2rzZUPaWO/UmBqV2b8Ejg8dVdt1fjsF7orjvwx20CT6z/78Vx2K9xX3cBTqoA1Z/weXsVCP+0ziPDlQxY0j6WNY7kIuDjq0LXWpbq8aHAjYCVPRoD8xp33YEXFfb3LOTVsX8PxktKrXueVdlyQUR8hvH4R8mAJe3LEqrpohhExFeAd9TxP+1urKyC7dbt2oZ78NFPcO8d3EpBHXMXAl/fq6VmImJUIelhncA3zdMqlDnViAxY0gHQDlZ/OXA548Hskwq4BJ6cmUfuUWFxJXCVu+5Aarvi3h4RH2APlppppyjJzAfQTHw7nOE8uAI4w5YrGbCkA9QiEBEZEe+kmV9q2jnQLp3zPcDdaBaP3pUFoCNimJlLwEcrEPaZ3uKmfXqt3ou7WFeVE3cCjmPy4s7t0lJvBM6oRam9C1YGLGm/i4jMzEGFpD/uFArT9IHvqW7C3O3PzN4NsNd8OG4v7sKrULeSmddi3D04be3BAD5cwcrB7TJgSQfIsL6eR7P0SJ/pM7sn8LuZea1qWdqt1oS2gPoa4/E4OjjaYP1Hq46HXcz3kTQ3eVx3yjHYVgTOAf6wzhFbr2TAkg6KdrB6RJwNnMv0SRPbwfDXAP7PDLX47Q6DAE8GDjP7ArvaJ4drhf8P7lHAapeYelL97kmBqW0Jfi7NuMGBc1/JgCUdwIKratinMVurUK++7lgFzm4P3u0DR7jbDux1+hq7/UtrcPsKcAfgRypcTVoap0czrvGjNbjdAe4yYEkH0KhCy9uAtzBe4HlSwEngJ4E7M54XaDcKunbS07M6hZn2v7ZF6G+AL2bmYLfvyqsWqO9k+hxcbcB6T0S8JjN7Dm6XAUs6gDrdhFcAn5kxuAwrmD26nVNrlz7nICIuBJ7V+Rza/9rj8bMRcRW7P/4uM/MImlbenFJetHcW/mFVPCxbZMByE8gWAn6/Hvszni83r7uqhrt86/y0Obu0Px2368mumV5hBPws8O2Mp19YL1z1aG7EOLPzPcmAJR1ENWXDEs2aac+rGvjylPNlBHw38JPVBbKb59DReBfhQdG2kH6dccvlrsyB1pma4Ujg96riMany0Yapv4mIjwM9JxiVvFjroJdizViRUWbeDHgfcG0mr7XWFhxfBG4DXLbThUl1uSRwC+DtwPWYvh6cFj9gBfDViLjBLp8TUZWPmwCf64SrmPJZv63OC9celLAFSwe9htGEq4iIzwEXM9uUDUPgJsCP1euXdvoz1uOngQsYz8ulA3CN3q2VAzoG1Yr1eMarB6wXrtplcz5Cs/SUx6ZkwJKu1s7181TG8w5NzDx17typ/r8rtfX6jMe7uw6Etjvw1IhY2a2QVcfYCnAz4EGMuyrXfUl9PSMizmM8MalkwHITSFfXwl8JfILx+oPrBrIqVH4lM29ZM7vv9LnUjmt5eqdg0/739d3+hRWQbg4c06lQrGVU4evjEfGyagl2rUzJgCV9Q4FCRFwEPGOWl9AMhh8Bv9EJXTv6MevxY51WA+1vkxZV3rHjrLq8T5/hOGsrIc+qCobrZUoGLOmbZI07eRPjLsBJ+vW878rMo2kmHt2NwvAaOLh9vxsCSzTL47wqM/u70TJU3ZAj4D7A7Wm6CtcLTe28WJcAn67/O7BdMmBJq6rtTfdbH7gQ+Kf69sqUgJXAPYD71pQNOxl8hrV0ybvqa1o3pvZB6I+Iw7v8+5Lm7tilKcdzO/fVqyLifTg1g2TAkiYVGhFxOU33yCznR1trP7VmvN6xgNWZef5imnE50+521OK7eJcrGcPMvAbw2Dq2pnX5BU33oC2qkgFLmljAjGperI8CL2W29QmHwEnA/Wm6GXf0bq8qzFz0eZ8fihVwHtsJ8uzwcbVU46h+EziWyVMztGPDPgOcj1MzSAYsaQbtlA2vrv9P64ZrZ7k+tbpIdrLbblQtWU/s/G7t35C1K13AnakZjgceWeXCtKkZesCfRoQTi0oGLGkm7bir9wFfrhAzmnIOrdAMdn8IzV1YOz1n0dmdQlj7S9sSdAlweJe633oV3B8DnMB42pI1Q36dE18Gnlctvk7NIBmwpCnNBuOxTmcBf8Z4MPu0QrEH3KFq8jtdKB7CO7b2c8DvAX8bEZ8EBrvROlQ3UNyR2aZmGAJPY/JdhpIBy00grVXeZB94Ac1C0NNmd1+qn/+fzPwxmjv+tv3cqjFiA+As4E86BbL2n2N26UAfVKC6M3CXCk/rtcB2W69eSHPX4bK7SjJgSTMHGZpuk3OBv6jzZForwpBmcPAvd6Z82JFztqaE6BZ62ifBvsLNZcAfdo6rnTSq4+mJwFHMNjXD0+puW8sPaVJZ4iaQ1qzZt+fG0TQtRteqAjAmFI6jeu49aVq+WBWGtuNz9aol63uBNzCeeNRzeX8ErPYOwqMj4spafiZ36BhvxxfeFXgL4xs2Yp1wBfBR4IeAixjfdCFprdqwm0Bao+bRFBwD4ArgmVXorUyprCRwU+AR2x2sOp9rVI8f8Bzed9oQ8yagtwvrW7bH+eMYT/0RUz7bFyLifFzUWTJgSVuwUoHmL4CvMX3Aezsv1imZeYOauHHbW5Yys10v7oz2W+6qfRWwXlpdcIMdbL3q0SzvdFfgRxgv3Dzp2O4Bz6xj2q5pyYAlbb52X+vAXQj8EdMnHm0LnuOBR1UhthNTNvRrcPEz6/8umbNPDjmaRcRXB66d0Ia3h9fvmXQMtZOO/gvwb8x2Z61kwHITSNMq+9kHXkwzvmpa7X1Qz3kkzbitlR2cy+gYC7p9o21B+mREvHAn55dqW6Ay80Y0qxDA5JsyokLW6dX1nXYPSgYsaWtNCjWvVUScAzx/htp7WxgdCTymM5ZrOz/TSoW+VwL/Ue9vK9b+sBvTM/QrvL0YuAPjedzWMqxj/i0R8b4Kfh5rkgFL2hbtvFZ/RrPQ8ixjsUbAQzLzxtVasBPzYl0BfBrvINwP2lbRp3eC+rZr7xzMzO+nmffq8IRyIDvB/fR6rWWGZMCSti3IZIWmS4BnVWE4yx2F1wYeWTX+7S4ws7p6TmXy9BFaoCAPfGSHf0dWq+zjaKYg6TP5zsFDwK9HxLvrXHBiW2nWssNNIG0o1RxFMxbrW6acQ6MKPhcA38N4XqzRNn2Odj6sOwAfZjwJpBbPCk037yuAn2GHZkivGzaGNYfa+xl3/613/AbweeC7gUtx3itpQ7wgS7MXUIPqlnsm47FWk86tEU0r1iO2e43CzrI5nwT+YYbPo/l3ZEQc3skKdU3v8XimrznYHq9/HBEXMV4QWpIBS9p2o84dhV9k+hI67Tpvj8zMa+/AvFi9CnyXM/3uRs2vdv60v6j/b/sg8nbeK+D2wP0ZL8uz5tPrZ18G/qKOWcO7ZMCSdqj6P55F/Rzgz9nYHYW/swPzYrUF8b/SDFbuu5cW89CqfffuTsDZ9hBXx++Tmd56tVJh7PfrGBvYeiVt7sSWNHtLQFTF5ASaKRJuwOTb3NuC6RLgVjQzwm/LWKx2nbpqVbuMZrkTB7wv2CFV++tTwN2A8+r4yG08Ztvxer8O/AGwxOSxV9C00N6mjivnvZI2wRYsaSM1kqag6UXE14HnMn0W7Lbr7hrAb1Ww2rbzrgLfscBXcdLRRdR2vb0gIs5lm1uLKoSPMvME4Kk0rakxJfD1gGdExCW45qBkwJJ2s1CsYPNs4KpqEcgp59kQeHBm3rYp97Y+L1Y7iWkNQn42DnRfVKMKPjthUMfao2gmMV2ecN1vW6/+G3hZ3UThuD7JgCXtjrYVC7gS+CmaQeajCSGrbTG4LvCP7XIj21U4V9g7A7iwPpctDosTrJaA82nmV2M7p2eo42JI03r66Do2lia9hKbr8DkRcX7nWJdkwJJ2LWQN6/F1wJtnCDZ9moHo356ZP1ljpwbb9DkiIt5MM9eWC/Eunk9HxOU7sGbloLqkfxM4jukLOveBF0XEczJzyUlFJQOWtGc5qwaYP4nxWKtJ4WZQLQiPr3C1rQOZaVrUDFeLo+1+O73CVX+bj4dRZt4Q+EXG81qt+fT62RXAMzotX5IMWNIepKvxorf/ATyS8bxXk863EXBb4OSaF6u/PR8lRsDv4XxYi+iYHeiKizo+TwFuyOQ7XUcV7v4hIj7ZOZ4kbeUkdBNIW24taFsfPgV8e51X651bbSj7CPB99e/lrRSw1VqRwEk0c2JdtwpTz+/5Nax99GHgHjStR9uyFE3N1j4E7ge8mqZr+tB6T6fpHhwCdwI+saryIGmTbMGStm5QBdTv1zk1aaBy22J1R5pb8w9v9Tys1oaliPhP4EP1Oxw/swDZHPhsRFzK9k6HMKxj4gmMB65P+gxLwM9FxMcNV5IBS5obdedXD/gr4PnVWjCcct6tAA/IzBMZL8GzpUK1WtJexbjLR/N97e3RzKwO29StWws6jzLzfjQtUpOOhfYYfQ/weqdlkAxY0jz7I5rb7meZtuE44Dc70z5sRdu99E+dwlvzqTvf1IWdLt6thqsA+pl5BPDYKcdgO7D9SuA+tablyGkZJAOWNFeqW6UfEZ+iGfeyxORWrLa14KGZeeOIWN7q5KNVwB4FnM309ea0d4YVbl4ZEV+u42Y79lWvupz/H3BXJi/o3I4Be05NETFwYLtkwJLmtuCsAcaPBN7HeGzWtNaMN2fm8TTTPmxqYHoV0EsR8VXgL6sAX3aXzK0RTWvTttyIUF3MkZl3AR7I9BnbE/g08OftlA7uEsmAJc2lCjlZg5afRjPOKmc4/24F/Gy1gm3lnGzD3AeBi3HS0XnUDio/DDy1jpmVbTj2hjUx6D8C16p9HxMC1hLwCxFxJk7LIBmwpAUIWSvV3fJa4Ck0rViTWpLaSR1/MzOPAnpbaMXqzi5/2IA1twEraZY2unQ7WrAyc5CZS5n5DOB6FdgmtV4NgD8BPlwztnvXoGTAkhbCqO7I+kvgaxV0RlPOwZvTjMlZZgvzV2Vmv7p8/hzHYc2jldq/z619PdjiHGj9arm6KfA7dawNJoQ7gHNpbq64EqfzkAxY0qKo7paMiK9U0Jk2u3qfphXr3pn5P+o2+81Os9Cr3/+B+r0GrPnRzkn1FeA/KwhvuvWoXh+ZeT3gFTQtpZOOs3Zc1h/U65e8a1AyYEmLFrKGmXkoIp4EvL5aFVZmKHyf0AldmzGqbqcLgXMMWXOlnZPq/Ij4N7Y+9imq9erBwIm1r9e7pg9p5md7PfA8xjO4SzJgSQtnpVoZngh8dUrYaQPYj2bm6RFxODMPbSbY0dz2/x7gs0zuntTeePY2TMkxqDB9X5oWqcNMnpIB4OPAAyPiEpoWVoO3ZMCSFk+1TvQj4t+B0yvsLE85H1eAX8jMW1bI2sw5mtWK9feMJ5TUnIRu4IPbcNdeu7TO42r/TlsOpw88MyKuqpswDFfSTpcBbgJpZ1VrwxLwQuCnqkVhvQJxVEHri8A9gS9Ua8NoA7+vV+O4vhU405A1N8FqALwG+Inap8ubPJ761QX9g8BbOsfMpOPpU8DtK+A7Y7u0C2zBknYhY9VSJKcxnkE7J5yTh4GbAI+uLr8NhaMKVwPg68Br6/WOt9n7yuwQ+M+abX1TAadufsjqGnwd47sS1wtXCXwM+D7gKsOVtLsnvaSdTljjVoeTgb+jadEaTHhJ2+LxaODPKqStbOL33Rl4K80SOuE5v+dOiIiLMjM2GnTatQZrrrVPAN/J5NbQ5TrO/mdEvKG6Bg3a0i6xBUvajZrM+K7CV9GsFTdtAtJ20PsfAbeqQnUjdxaO6vd+kHGrmfZGO8j8fTQD0zd7h2gbrp4H3KKOj/6EgL5EM/bvzYYryYAl7WfLVbg+owrbaXf4tfMkPTczr8MGZnmPiKwZvgf1+9pCV7urnez1UuD0uoNvM61Xbbi6GfCwOjbWawFdrp+9JiJ+r44H971kwJL2pypUIyLOAx7P+K7BSefnCLgb8JAaFN3f4O9cAT4BXOke2LOANQAuiYh/qa7BDYWdzoSiJwLvYjy2ai3tOoMXAk9yIWfJgCUdlJC1Uq1KbwceSzP546QCd6laJE7LzPs15W0ONvC7+hHxSpq7EQdsYeZwbTpgJfCyNiht4j3a5XD+FLhhvV9vnd81BC4B7hkRH8GFnCUDlnSAtHcGPo9m2ZTBlFaGAXA0zR2B31LBaaPn7ntxgPteBawAXl1BZ0P7rQLycmb+Ns2dgG3331ra1qtXRMRHXchZ2uMKtZtA2oNSdzxX1c2BNwM3rsJ30lInfeBvgUfQ3HK/Mm0sTwWxpFkM+IPACfU7PPd3J0j3gDNo5jS7gA1Mk9A5Ro6mWQngONaf86r9XX8HPKT+veKUDNLesQVL2ouaTVNwHoqIz9IspTNtrcJ2FvgHAfet8VhLs/yeet7ngbcxXlhau1eB/f0ad8cGwlXUMXIN4B3AMax/N2g7U3sAj6hWK8OVZMCSDmzIOlzjqV4GPJ9mPNak8NNO7fCnmXlSvX6WQe/te761Qpzn/e4FrADeWnd/zhyugEFmfgvwBuCOnZC9VrhaoZmc9mTg8upWNFxJc1LDkrQHqjDt1TxZ76YZZ9NOMso6BWoAFwH3Aj7KlKV02kktM/Mo4HK3+q5o9+GLgYfTtCitzHhMLNW4qzcA92U8Yeha2p+9KyLuvpkJTCXtDGuy0l7WcKowrKB1Kk1r06RB71GF6vE0XU9DYGnS/FjtnFj133/qBADtYHauffhfEXHlrJXZzqD2k2mm55hlUPv7gZMzc8lKszRH13c3gTQHpfF4aZt7AK8HjmTyIs3tGnRPi4jfa18/w/t/D/CeKrQd7L5z4SqAc4Eb19qDsxwDg3rtjwCvnnKdbvf1GcAPRMSFtl5J88UWLGkeajpN+FmKiLcD/4umC3CF9cfttK0aT8jM0+v1gynv34uIfwdew3gSU22/tnXw9M44u2nhqlddiNep/ZNTAvaIZkzWMytcHTJcSQYsSWuHoOXMPCIi3kQz59US02d6HwKPz8zrdSYxXU+/pm14fhXcFsg7tCtpptH49CxPbluuMvMOwKsYz5O23h2D7bir342Iv63WycNudsmAJWl9h2ssza/S3PXXzuS+XkFOhbC3ZOb1pywK3XYrfQ44s15vK9b2aucre39EvKFdQ3BCuArGc2M9DvheJrdcDeuY+O2I+AMnE5UkaUbtgPXMXMrMt2bjcK5vWI8fy8zr1Wt767z3oB4fW69ZSW2ndl/crbZzf9J+bvdTZr6sXnfVhPdersffrNcc8myR5pcDXKX5DFntDOyHgNcB9+60jqylnRbgDJq7zy6Eb57YssJb0MwKfgbN2nZeC7Zpt9XjBcCdaVoK11wLcNX0HC8BfpbJ0zG0+/ds4EbUGDrHXUnzyy5CaR5rPk2hHDQTSP4v4I2MF/NdSzsT/InA+6qg7q+evqEK5AFwMc0Ep+20D9q6dt+8sGboH0wIV1Hh6u8qXB2eEK7aqTu+WOG5RzP3meFKMmBJ2mTI6kXEFcBPMZ5aYTQlZN0K+Jka+7NWoT2swvkdjO9G09a0wfUq4On1vZUJ4WqUmS8DfqbC1aEJ4apf4eqHKrhNnFhWkgFL0vSQ1U6/cAlwCuOB6eu1XrRrFr4oMx+y1jQB9Z4REa8B3luvscDemjZMPQv4emYO1umeHQBR3YI/WftqWrg6B7hXRHyq3td9JRmwJG1DyFqhabV4Ps2yK21L1Vohqy3EhxWyfr7uLFzdktWvAdhPpmlB8U607QlZ/1XBaq0xbUu1SPefM1u3YB/4CnCXiPjvaXckSpKkTWjvGsvMh3XuABytc8fZqHNH2891X995v37dyfauer53FG7+zsFRZv5nbdfeGvuuvXvzDpl5ft0Vut6+a/fDWZl5y+7rJUnSzoSspXr8pRlDVntr/8+vDlntFAKZeY9VUwxoY9pt/MDudl0jXJ2YmV/v7JtJ4erLhitJknY3ZLUF9imdAn5SyGoL7Yesen1k5iAzj6z5toa2Ym3YSn19KDOPaVsF1wixt8/MC6bMPdZ+/+zMvLnhSpKkvWvJetgGQ9bPrXp9GwDuZSvWliYW/bFV2zM6/75zZp4zY7j6YmZ+h+FKkqS9C1ntmKxZuwvbQvzBq17fBoF3Orv7psLVx2rW/XY79jv/flnnecMZwtWtDFeSJM1PS9Yvz9iStbyqu3Cpugl7mXnfWqpl2ew089iryzLzJ9tQ1B1/lZkv6Wz3aWOuzsnMWxiuJEmav5B1Smfdwo20ZC11xmW9267CmbTb94LabtFpETy50xq4PMPg+C9l5k0NV5IkzV/IWqu7cDjDFA4P6gSEQWb+YP3MVqzp3YPDzHxBd2B7Zt6vE74mdbUe7kzFYLegJEkL0JL1S2t0QU1qyXpUZl6vXntUZr69fmbImnzn4Ec64fSamfnwzpxYy1Nen5n5FadikCRpMUJWdwqHM2doSWlbss7IzNvWa+85Za4mW68aP1Xb6+jMfP8M26wbvJ6QmTep17sWpCRJCxSyjsnMN88wLqvb2vLkeu0/ekfhuq1Po8x8R22na2bmv9fPrpoSytpuwd/u7CuXK5MkaQFD1lJNIjrtbrbuuKtnZ+atM/OzU15zEAe2jzLzotq298/M980wmL07Fu7R9dpDhitpfws3gbRvQ1aPZkHoI4C/Bu4HHEmzKPG0RYYvplkM/li35HiT1jXzHODPgKes2mZrGdV2/CBwSkR8NDN7ETFyc0oGLEmLG7ICICIyM+8JvBEYTAkFK/UcTdaGpN4627BXX+8ETo6ICzJzEBErbjpp/7OJWtrPNaiIrKB1KCLeBtwXeEWFq2WaVpnVBvX9dAuua9gJUN+QaetnbUB9QET8QIWrvuFKOkDXXzeBdDBUAT+sf/8FcEonFHgt2IZN3NmOHwD+ICJe0XbVtmFXkgFL0j4MWUBExEpmPg/4aeAabpltcxnwqohoJ3C1S1AyYEk6ICErgF5EDDPzRODVwPWBo70mbG6TAlcA5wMPjIgPtXNbtS2Gkg4ex2BJB61W1XRVjerfZwB3Bv6zfuzdbRszqoD1GeB/VLg6FBFDw5V0wK+1bgLpYGnHYmXmtwAvBa4D3A7HYm0lZPWAtwKPjoiPuUkkeTGVDla46kXEqNYefBtw6/rRMt9492B7bbCVe9UmXLWNsrZRdrbVrwLPpxnYbiuWZMCStN/DVZ3z3wK8CbhtBaulCS8bGbJm1nYX9oETgU/S3FBgyJIOIC+c0gE636uwf3CFq8MVrq4E/rVCwY/RTEb6XTSzj/dwXBYVnEbARcCvA/8C3A14BvA1mrmvus99krO1SwebLVjSQUgHNaM7zdI3/00z7mpE0y34loi49xqvOQF4LXDXdSpkB6l1q535/tMRcatV2+mmwCdqW/bquVcCdwc+2gm2kg5SjdZNIB0Ig7p78OEVroadCtYTM3NQC0P362sQERcCv7jOdaI79mi/GU34u/6xts+hzOxl5lJEfB74+wpgo9quxwK/y3icliQDlqQDdt5nTYY56kwvMKpWr6V1wlXQtNrstwDRtsqt17r/0to+w+oCHNWcV88Czq3ntNvkfjStV3YVSl5oJR1Aay76XC1eq68RbVfXR2i6Dl9bgWJ5H2yH5fp7X02zXmP3720dt2obDZuH+DjwMb6xFetCDy3JgCXp4Lq47jBsuwf77b+Bi1c9t22t+nx1IT4DuJympWuRW7KG9Te8j2ag/5WMB7Z3LbWztM/gBA8tyYAl6WBYa3zRvSNiFBGH2y7CiFiu1pl7rQpWfZrWmVMzMyLiPcCPVBBbWdCQ1Y5H+wBw3/q7P1jfW32NfGr9vF9j1g7Vv28A3GRVIHszTRei11lJkvajzFyqxydm43A9jurxvZn5A5l5l8z8/sy8a2Y+on42rOeNMnMlM8/OzOtlZmTmEfW+f1fPvSoXz7Aef7T+ll615H1+jb/9ysz8jTW27+/Weyx3tu3J9bOBR6AkSfszYPXq8daZeVkFgdGqkDXNlfX4u21oq5C1lJlHZ+Y/d0LGojjcDU0VrJYqZP3SqjDa9bLMfEnna6WzHa+qr58wYEmStP9DVr8e/9+q1qa2dWatr9Gq5760naKg875RX4PM/NcFClntZ3xdt5WvE7T6mfm8asXqtvgNZ3jPD9U26XvkSZK0vwNWdLoKn9sJTpPC0KjTcvWStjWsM3Ep3e9VKHntDEFkHroFh5n5pcy8VYXD1aGxDaQfWtWCN6pt1v1qQ2pm5nmZead6D8dfSZJ0QEJWGxz+YgOB5CWdABXrvHf7vrfptOaM5jhgXZWZN2kD4nqBNDNv3+n+HE4IWJmZF2TmbdZ7T0mStL9DVtS/fyUz/6gzbuhwfbX//1JmPqr72invPajWrF9YNYB8nrQtTX/efuYJf08bGr+3QuYVE8ZyfTkzbzftPSUdDK5FKB3coHX1LOOZee11nnY4Ii5ug1VNPjr1PWv6gqvm9E8/DBwC7hER76jlbpYnhax2LcHMvA7wE8BdGK9PCHAacE5EXNLdrpIk6WCGrMG0gdjdwd9Tntd2IR6XmX89x+Ow2m6+f8/MG3Zb9CaFrGnPaQOmR5UkcKJR6UCLiJWIGHbuBPymr0mtO6uvJ9XS8z+AB9O08MzjNaZHMynqdwOPrFa5wZTtNIyI7ITIpVVfvdpWtlxJgmkXFUkHJmht5wzsK3zzEjPzaMQGuzFrOw355jUKJembanKStK15bUGuLcFir58oyYAlSXMZsI5zM0gyYElaFEPmt3Uo69p3IfDazueVpG2twUnS9iSXZv6nHvAm4O4047Hmbaxn1rXvwoi4pntN0k6wBUvSdhpFxGHgscDlFWTmacB7O0gd4PGrl8iRJEmaS53Zz7971ZqGe627XuDDup9VkiRpEUJWrx6flplfqXAzmpMlcn6pPtsh95QkSVq0kHVEPb5pVcDZC8v1+ETDlaTd4NgDSTtlWIPe5yHMtHc0nlXdgs5/JcmAJWkxRcTKnIWZo9uFmyXJgCVJ2+NiN4EkA5akhZaZwXzMt9feLfgbmXkksFKfTZIMWJIWSy2OfHgePko93g4YbPPi1pJkwJK086p1KDPz24Ab00w2Og8tRpfhAHdJBixJC6pfg8l/APhOmtnT5+F64zVPkhcbSQvvHOavxcixV5IMWJIWUrv+4P0r0MzTtWbF3SPJgCVp4UTEqMZhPXhOrjVRwepY4HH12VyHUJIBS9JCXl/mad6pUX2m4+suQq9/kgxYkhbLHM6YPqAZD3bXzLwuzoUlyYAlaVFkZi8zIzNvBxzDeDzWPFzvErgjcOOImJepIyQZsCRpqnYizx8Drkkz9mmegswIOM/dJMmAJWkhVJfbSmZeE/jhNnDN00es694vz9EyPpIMWJI0UVTX2zWBO83xdeaHqpXNgCXJgCVpYVzA/Iy9Wn3NWwG+MzN/GBhmptM1SDJgSZprbYvQr9f1ZTiHn28EXINmOR+na5BkwJI0/wErM3vA99X/53Fh5X59rgfUZx262yTtVG1TkrYkM/sRMczM2wPvAo5kvga40wl9AVwUESe45yTtBFuwJG1jxsoe8GSaJWnmtQLXLpuzlJk/Xx984O6TZMCSNJcBq+4gPLETZOb2swJHA7erUGhrviQDlqQ5SyuZvYjIzLw5cATNQPJ5Di1L9fhw4Fo0c3d5PZRkwJI0l9eS/wvciGbg+Ly3Cg1pWrGe4PVQkgFL0lypGdFHmXlj4BSa7rdFGNOU9XWSk45KMmBJmjdH1NirxzOe+2oRwsqApivzHpl5WkQs200oabtYY5O0aZm5VMHkZOCvabrcFmnQeDtP10XALYGvA1RglKRNs7YmabPhql/h6oHAPwDHLVi4aiuZI+AE4O0VrLwuSjJgSdqTcLVEM+7qB4F/rGvJvN85uJ4+Tbfmd2XmgyJiJTMPuZclGbAk7Wa4GkTEcg0MfwLjcVeLfD1pF4H+m8z8+Yg4bMiSZMCStBvBKmq+q5XMfGBmfgS4J804pqUF//OCcUvWizPzIW3IqrskJWnDFxVJmhSsekDUOoM94P403YKDCiT9/fTn0nR19oEHRcRLahu0f+OoWu4kyYAlaVPBKoB+RKzU/68FvBr4/gohuc/CVTdktdfHJwJ/GRFnd7ZL36AlyYAlaaPBqg/0ImK5/n9j4ME0y8p8awWQg3DtaO8o/Crwl8BbgHe0waq2UzqlgyQDlqSJwSoihp3/Xw94VIWrG60KHQfFCt84K/07gT8BPhARX67t1APnzpJkwJI0DlFXz1vVhqvM/Ang1hWurllPbe8SPIjXjLY7tLsE0BB4LvDciPhkbbdBPcfuQ0kGLOmABqsABm03YH3v/jRjju7YeWq77I13HK8dNC8GXgo8LyI+3NmWS8DQVi3JgCXpYASrAU0Ly6j+f3PgMTTLxNy9fRrjrjGvEevrdh9eBrwf+Cfg7yPiwk6Q7XW7XiUZsCTtj1D1TVMMZOYNK1g9ohMSVmhaZ2yt2sDmZTytQ+u/gDcB/xAR7+nsgwTHakkGLEn7IVz1ugV6Zj4U+C7gV4Bj6ttt60rfLbbloNXtTl0GXkszTust6+0TSQYsSYsZsr4HuAXwOOA2nR+tvkNO22NUX4PO/z9CM4fYCyPiS5kZDoSXDFiSFi9UDWpJm4cCL+z8aJnxsjCe/ztv9Uz3ZwP/E/hPsLtQ2s8cayHt78rT99G0oFxZj0s4eH03tWOvRsBh4AY0rVgj94FkwJK0gOd2Day+oM7zvuf7nobdXidsOeZNOgAcfyHtMzWI+qr693U6hbzmw1EAEXG4pnHA8VjSPqzlugmkfROsopa7GWXmbTLz/wMeamVqbrQtWLfOzNdn5gMiIiMiO1NpSNonrNVK+yNc9YGoge0vAn4KOJKDszDzQu2uzj55D3ByRJzX3pjg5pH2B1uwpH0QriJiWOHqBcBDKlytGK7mtmI7rK/vA/41M29f+6/XLh4tyYAlaW+CVWTmUkQMM/OHM/P1wC/STMXQXZhY86dfXyPgu4GPZOZjImJUXbxem6V9UJOStHjhqtdZT/A+wD9XoHLy0MXTnZj0j4HnR8Qn7DKUDFiSdjdc9avV6ljg74H70MxvtVKPWkztpKRfA+4eEZ9q97WbRlo8NkNLixWuehWubgL8C3C/ClVhuFp4fZrJSK8LvD0z71T7ut9O5yDJgCVp+8PVUo3PeQRwFnA3xpNWan84RDN+7vrABzPzRdWCZcCSFownrbQY4artFvw14Dk4G/i+3+U047L6wItobl7oASMnJZUWgy1Y0vyHq0GFq5+scLXCeOkV7d/Kb5/mjtCHAs+uliz3uWTAkrSNhS3AdzBu2bD1+eDs+yFwoptCMmBJ2hlXVoFruDpY+sDlbgbJgCVpZxisvFZL8qSVJEkyYEmSJMmAJUmSZMCSJEkyYEmSJMmAJUmSZMCSJEkyYEmSJMmAJUmSZMCSJEkyYEmSJMmAJUmSZMCSJEkyYEmSJBmwJEmSZMCSJEkyYEmSJBmwJEl7Kd0EkgFLkrS9DmXmkptBWhwDN4G0fTIzdvB9+27hA1kJHgE3A74N+Fxm9ut7WxYRmZkREbaQSQYsaa4C1aBTWK3sREGVmaMqCC9yix84UWHqOODoiBhtdyBq36t7LANDQ5dkwJJ2M1B1W5EyIlY6Pzu0QwVsLzOPAH6yvmfX/sEKWAlcH7hZZn4SWMrM5W39JRGHu8dy51jPNuQZuKSNn7yS1g9UUYGmV4XMcNXPfwZYAo4FTtvBc6oPnOAeObiHInAxsLLN7zuqY/tTwPM6ge4VEXHpqmN9qf39hi3JgCVtNlgNaFqoVgeqOwJ3AB5W37rTLn6stjCUdtqnKtC9A3gZ8B8RcXhV2AJYMWxJBixpUqDqdWrv2RmXci3gbsDJwNGMu+laK4y7Ufqer9rJw3SH37tbmVh9x+K7gc8ApwNfjYjLOudOdIK/XYmSF2wZqq4OVbHG+JNTgFsAvwoc2fnRcNXbeGef9qNRp+KQneN8Gfgq8Ef1sxdFxAWrzp1B+3rDlgxY0sEKVX2+eYD69YGTgEcAt6lw1dU+1xtDdBANK2itPv6/UoHrsRWq3rlGV+I3jV2UDFjS/ghVfYA1xlPdCHgCcEPgRODmBipp+inVOT9WdyV+GDgTeCJwTkScu6py01vdWiwZsKQFDVdtsKoL/HcBP03TivWbqwqIFcZjSRxMLk036oSu1S1cXwVeAHwA+OeIGNV5GFXhsftQBixpwUPWfYBvB54EHE8zWL3Vdn30DFXSlq3VlZjAOcBfAR+LiJe7mWTAkhY3VLWDch8O/NmqH7eTNLq2m7SDpyFNq/Dq8+xDwC9FxMcys9e2bEkGLGn+w1XU0jLHAxfSdGMMO7Vqj3tpd4MWdQ4uA0cB94uIf+524Uv7jV0i2u8urUA1qEfDlbT7Ffn2HDyigtZTVoUvyYAlLeAxbqiS5kefbxwHKRmwJEnaBo67kgFLkiRJBixJkiQDliRJkgFLkiRJBixJkiQDliRJkgFLkiRJBixJkiQDliRJkgFLkiTJgCVJkiQDliRJkgFLkiTJgCVJkiQDliRJkgFLkiTJgCVJkiQDliRJkgFLkiTJgCVJkmTAchNIkiQZsCRJkgxYkiRJBixJkiQZsCRJkgxYkiRJBixJkiQZsCRJkgxYkiRJBixJkiQZsCRJkgxYkiRJBixJkiQDliRJkgxYkiRJBixJkiQDliRJkgxYkiRJBixJkiQDliRJkgxYkiRJBixJkiQDliRJkgxYkiRJBixJkiQDliRJkgFLkiRJBixJkiQDliRJkgFLkiRJBixJkiQDliRJkgFLkiRJBixJkiQDliRJkgFLkiRJBixJkiQDliRJkgFLkiTJgCVJkiQDliRJkgFLkiTJgCVJkiQDliRJkgFLkiTJgCVJkiQDliRJkgFLkiTJgCVJkiQDliRJkgFLkiTJgCVJkmTAkiRJkgFLkiTJgCVJkmTAkiRJkgFLkiTJgCVJkmTAkiRJkgFLkiTJgCVJkmTAkiRJMmBJkiTJgCVJkmTAkiRJMmBJkiTJgCVJkmTAkiRJMmBJkiTJgCVJkmTAkiRJMmBJkiTJgCVJkmTAkiRJMmBJkiQZsCRJkmTAkiRJMmBJkiQZsCRJkmTAkiRJMmBJkiQZsCRJkmTAkiRJMmBJkiQZsCRJkmTAkiRJMmBJkiQZsCRJkgxYkiRJMmBJHt+SJAsgaedlZgCXAenWkOZOZKbljwxY0oJZiogEHgUcBQyBcLNIc2M5IkaWQTJgSQsiM3sRcTgz+8Ad6hi3FUuaD1EVnhtn5r0iYiUzl9ws2q8Hu7RfwlU/IoaZeWPgn4HvAI60IiHN16laZc8ycN+IeFtmLkXEsptGBixp/sJVLyJGmXk94N0VriTNp1EnZP1oRLzZkKX9xpq99kO4CqCXmTcD3lvhasUtI8112ZPAEvCazLx3RCxn5sBNIwOWND+WImIF+FPgZsBhwAu1tBgh60jgdZn5AzUmy3NXBixpr9W4q8OZeQrwgzRdDg6alRYrZB0C3pyZP1ghq++m0aJzDJYWOVwN6mL848A/ML5b0ONaWiztmKwrgbsBHwZ6ETF002iRaw/SolcQvrPC1bLhSlrYsmiFZt66G9Y8dp7LMmBJe+yKuhh7QZYWu8KUNPNkSQYsaQ44KFbaPyHrYjeDDFjSfLjETSDti3AFcEo9jtwkMmBJu6zmvhpl5jHAD3k8S/smYP1Q3UXoElcyYEl7pF0s9uT6v7d2S4vvgrp70PJJBixpDyzVnUa/QHP3kQNjpcXWLgR9k8x8SK0r6px2WugDWloo7ZplmXkD4F00s7enFQZpX/n5iPibzDwUEYfdHFo0FkhatHDVr3B1XeCNwM0NV9L+Os1pWqX/OjMfWis12JIlA5a0g+FqUN0GpwIfBE6i6VLwOJb2j6AZTzkEXlghazkzo25ukRbmQJbmPVgFzZirw5n5FOAJ9aOR4Urav6d+neN94OeBv6sKVi8inMJBBixpG8JVv9YcfCrwOOAwzeSihivp4ISsjwA/GhFn11ABb2yRAUvaZLi6uqaamacDj6dZb9DxGNLBMqyQ9V/A3SLifAe/y4AlbSFcZebxwG/RdAuu4LI40kHVnv+fBu4eEefYXSgDlrSxcNWvsRa3B/4FuEFdXPses5IhC/g48CfAi4CRIUsGLGl6uGrHVd0eeAtwArZcSRpruwsBfiwiXtHOjeem0TxxkLDmTb9qo0+qcHXYcCWpe41gvHrDaZn5rcDQKRxkwJLW0ZlE9DTg/nURPeSWkbTKgObuwpOAU6tSZkVMBixpigfUozVSSZOMaO4slgxY0gwuchNImrEMsyImA5Y0o76bQJJkwJIkSZIBS5IkyYAlSZJkwJIkSTJgSZIkyYAlSZJkwJIkSTJgSZIkyYAlSZJkwJIkSTJgSZIkyYAlSZJkwJIkSTJgSZIkyYAlSZJkwJIkSTJgSZIkGbAkSZJkwJIkSTJgSZIkGbAkSZJkwJIkSTJgSZIkGbCkHZNuAkkzGrkJZMCSZrMEDN0MkqZUxEbA0W4KGbCk6RdMgKcAfWAFWLaGKmmVlbpe9IBPrLp+SAYsaXXAysw+8FbglcARNK1ZHqeSugZ1fXhWRDw9M/sRseJm0TwJN4HmLGFFRGRmBvDEClc/Ady6aqges9IBv0wAfwx8LiL+LDN7EWErtwxY0qwhq/P/Y4FrGrAkAUTEF+vaYLiSpE0ErUFmLrklJK1xbRi4JTTXFQE3gRbgYhoeq5KuLrhstZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZKkrfr/AVDC5T8kuktgAAAAAElFTkSuQmCC";

// Player registry — populated from Firestore on mount
let DEMO_PLAYERS = [];

// ── How many rounds this event plays ──────────────────────────────
// Four almost every year; three when the schedule loses a day (2010, 2011 and
// 2022 all ran three). It used to be a hard constant here, which made a
// three-round year a code change and a redeploy — so it is now part of the
// event setup a director edits in Admin → Event, stored on the tournament_state
// document as `meta.rounds`.
//
// NUM_ROUNDS is a LIVE BINDING rather than a constant, the same trick
// firebase.js uses for TOURNAMENT_ID: every round loop, leaderboard column and
// finalization check in this file reads it at RENDER time, so pointing it at
// the saved value before React re-renders updates all of them at once. The
// alternative was threading a `numRounds` prop through a dozen components that
// only need it to count to four.
// DEFAULT_NUM_ROUNDS / ROUND_CHOICES / clampRounds moved to constants.js — the
// Tournaments picker needs the same numbers to tell a finished year from a
// live one. Imported at the top of this file.
let NUM_ROUNDS = DEFAULT_NUM_ROUNDS;
const setRoundCount = (n) => { NUM_ROUNDS = clampRounds(n); return NUM_ROUNDS; };

// Derived from the ACTIVE edition rather than pinned to 2026, so switching to
// wbc_2027 renames the default tournament and moves the year without a code
// change. `num_rounds` reads the live round count above, so this object and
// NUM_ROUNDS can never disagree — several call sites reach for one or the
// other and used to get different answers once the count stopped being fixed.
const TOURNAMENT = {
  get id() { return TOURNAMENT_ID; },
  get name() { return `WBC ${getTournamentYear()}`; },
  get year() { return getTournamentYear(); },
  get num_rounds() { return NUM_ROUNDS; },
  status: "active",
};

// ── Firebase initialized above ──
// ── Firebase / Firestore configuration ──
// Firebase config + app/db initialization live in src/firebase.js (the
// extracted auth module — single source of truth for all Firebase infra).
// _app and _db are imported at the top of this file.
//
// TOURNAMENT_ID is no longer a constant here — it is the active-edition live
// binding exported by firebase.js and imported at the top of this file. Every
// read of it below picks up whichever edition is currently selected.

// CTP distance wheel — whole feet, 1..CTP_MAX_FT. Ported from MNQ's hole-CTP prompt.
// A ball outside 60 ft on a par 3 isn't winning a closest-to-pin, so the wheel caps
// there rather than scrolling forever.
const CTP_MAX_FT = 60;
const CTP_WHEEL_ITEM = 36;   // px per row — also the scroll-snap stride
const CTP_WHEEL_H = 150;     // px visible wheel height

// ── Google/Apple sign-in feature flags ──
// AUTH_PROVIDERS_ENABLED is defined in src/firebase.js (single source of truth,
// since it also controls authDomain + the auth resolver there) and imported
// above. It gates the "Sign in with Google/Apple" section on the login screen
// and the auth subscription effect. Keep it FALSE until the Phase 1 console
// work documented in firebase.js is done; the PIN login is unaffected.

// Aaron's decision for the trusted 12-player group: a manual "pick your name"
// claim links immediately, with no director-approval step. Flip to TRUE later
// to require approval before a manual claim resolves (that path is not built
// yet — it would write a pending record instead of claiming outright).
const CLAIM_REQUIRES_APPROVAL = false;

// ── Push notifications (FCM) ──
// Web Push VAPID PUBLIC key (not a secret — ships in the client bundle).
// Firebase Console → Project Settings → Cloud Messaging → Web Push certificates.
const VAPID_KEY = "BF3PLSs3kpCVHbhnbuBo1gSYeLKhYYwEgICUo07xRpuQP8LyxqkLkSV969ZcIptb1ZSY81h8738lblo9N2goNGo";

// ── db: Firestore data layer ──
const db = {
  _q: (col, filters = []) => {
    const ref = collection(_db, col);
    return filters.length ? query(ref, ...filters.map(f => where(f.field, f.op, f.value))) : ref;
  },
  get: async (col, filters = []) => {
    try {
      const snap = await getDocs(db._q(col, filters));
      return snap.docs.map(d => d.data());
    } catch(e) { console.error("db.get error:", col, e); return null; }
  },
  upsert: async (col, data) => {
    if (!data.id) { console.error("db.upsert: missing id", col, data); return null; }
    try {
      await setDoc(doc(_db, col, String(data.id)), data, { merge: true });
      return data;
    } catch(e) { console.error("db.upsert error:", col, e); return null; }
  },
  // Write many rows as ONE commit. A `for (const r of rows) await upsert(r)`
  // loop is not just N round trips — every commit fires the collection's
  // onSnapshot, and those handlers rebuild their state from the SERVER copy.
  // So a bulk change lands as N repaints, each showing the rows written so
  // far and the rest still on their old values: the change appears to crawl
  // down the list. One batch is one snapshot, so the whole set flips at once.
  upsertMany: async (col, rows) => {
    const valid = (rows || []).filter(r => r && r.id);
    if (!valid.length) return true;
    try {
      // 500 is Firestore's hard cap on writes per batch; 490 leaves room.
      for (let i = 0; i < valid.length; i += 490) {
        const batch = writeBatch(_db);
        valid.slice(i, i + 490).forEach(r => batch.set(doc(_db, col, String(r.id)), r, { merge: true }));
        await batch.commit();
      }
      return true;
    } catch(e) { console.error("db.upsertMany error:", col, e); return null; }
  },
  // Write a set of rows and delete another set in the SAME commit. Doing it as
  // a delete followed by writes means the collection is briefly missing
  // everything the delete took, and every listener sees that gap and rebuilds
  // its state from it.
  replaceMany: async (col, rows, deleteIds = []) => {
    const valid = (rows || []).filter(r => r && r.id);
    const gone = (deleteIds || []).filter(Boolean);
    if (!valid.length && !gone.length) return true;
    try {
      // 500 writes per batch is Firestore's cap; 490 leaves room. Deletes ride
      // in the first batch so the replacement lands with them.
      const ops = [
        ...gone.map(id => ({ kind: "del", id })),
        ...valid.map(r => ({ kind: "set", row: r })),
      ];
      for (let i = 0; i < ops.length; i += 490) {
        const batch = writeBatch(_db);
        ops.slice(i, i + 490).forEach(op => {
          if (op.kind === "del") batch.delete(doc(_db, col, String(op.id)));
          else batch.set(doc(_db, col, String(op.row.id)), op.row, { merge: true });
        });
        await batch.commit();
      }
      return true;
    } catch(e) { console.error("db.replaceMany error:", col, e); return null; }
  },
  delete: async (col, filters = []) => {
    try {
      const snap = await getDocs(db._q(col, filters));
      if (snap.empty) return true;
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 490) {
        const batch = writeBatch(_db);
        docs.slice(i, i + 490).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      return true;
    } catch(e) { console.error("db.delete error:", col, e); return null; }
  },
  deleteDoc: async (col, id) => {
    try { await deleteDoc(doc(_db, col, String(id))); return true; }
    catch(e) { console.error("db.deleteDoc error:", col, e); return null; }
  },
  // `onError` is optional and exists for the one caller that has to know the
  // difference between "not answered yet" and "answered no": the roster
  // listener, which owns `storageLoaded`. Without it a refused read would
  // leave the leaderboard in its pre-load blank state forever, waiting for a
  // snapshot that is never coming.
  subscribe: (col, filters = [], callback, onError) => {
    try {
      return onSnapshot(
        db._q(col, filters),
        snap => callback(snap.docs.map(d => d.data()), snap.docChanges()),
        err => { console.error("db.subscribe error:", col, err); if (onError) onError(err); }
      );
    } catch(e) {
      console.error("db.subscribe setup error:", col, e);
      if (onError) onError(e);
      return () => {};
    }
  },
};

// Push registration moved to src/lib/notifications.js, alongside the
// unsubscribe / status / test-send half it never had. registerForPush is
// imported at the top of this file; the settings screen owns the rest.


// ── _e: the active edition's slug, for document ids ──
// Every id below that used to hardcode `2026` calls this instead, so a second
// edition writes `hs_2027_...` rather than colliding with 2026's documents.
// See getEditionSlug in firebase.js for why it's a slug and not a prefix.
//
// A FUNCTION, not a captured constant: a module-level `const slug =
// getEditionSlug()` would freeze whichever edition happened to be active when
// this module was first evaluated, which is exactly the bug the live binding
// on TOURNAMENT_ID exists to avoid.
const _e = () => getEditionSlug();

// Which round a score document belongs to, and the fold that turns those
// documents into holeData, both live in lib/holeScores — imported at the top
// of this file. There is no second bulk parser beside them any more: there
// used to be one, for a cold-start read of the whole collection that ran
// alongside the subscription, so a score document had two readings that could
// disagree. The subscription's fold is the only one now.
// Convert holeData entry to a Firestore document
const holeDataToRow = (pid, rnd, holeIdx, score, courseId) => ({
  id: docIds.holeScore(_e(), rnd, pid, holeIdx),
  round_score_id: docIds.roundScore(_e(), rnd, pid),
  tournament_id: TOURNAMENT_ID,
  player_id: pid,
  course_id: courseId || "unknown",
  round_number: rnd,
  hole_number: holeIdx + 1,
  score: score,
});

// ── PAIRING STRATEGY ──
// Each round can be paired by one of three methods, configurable per-round in the
// director console (see PairingsEditor). Defaults mirror the classic WBC format:
//   R1  → manual        (director sets the opening foursomes by hand)
//   R2  → avoid_repeats (auto: minimize players sharing a group with a prior partner)
//   R3+ → leaderboard   (auto: group by current standings)
const PAIRING_MODES = ["manual", "avoid_repeats", "leaderboard"];
const PAIRING_MODE_LABEL = { manual: "Manual", avoid_repeats: "Optimal", leaderboard: "Leaderboard" };
const defaultPairingMode = (rnd) => rnd === 1 ? "manual" : rnd === 2 ? "avoid_repeats" : "leaderboard";
// Resolve the effective per-round strategy config from stored state, applying defaults.
const resolvePairingCfg = (pairingStrategy, rnd) => {
  const stored = (pairingStrategy || {})[rnd];
  return {
    mode: stored?.mode || defaultPairingMode(rnd),
    // leadersLast: for leaderboard mode, put the leaders in the LAST group (latest
    // tee time) — the standard "final pairings go off last" convention. Default true.
    leadersLast: stored?.leadersLast != null ? stored.leadersLast : true,
  };
};

// Balanced group sizes: `numGroups` groups whose sizes differ by at most 1 (max 4
// each for a full field). e.g. 12/3 → [4,4,4]; 10/3 → [4,3,3]; 13/4 → [4,3,3,3].
const balancedGroupSizes = (n, numGroups) => {
  if (numGroups <= 0) return [];
  const base = Math.floor(n / numGroups);
  const extra = n % numGroups;
  return Array.from({ length: numGroups }, (_, i) => base + (i < extra ? 1 : 0));
};

// Build a map pid → Set(prior partners) from every round strictly BEFORE `beforeRound`.
// For round 2 this yields exactly each player's round-1 foursome, which is what the
// "no repeats" method separates.
const buildPriorPartners = (pairingsData, beforeRound) => {
  const partners = {};
  const add = (a, b) => { (partners[a] = partners[a] || new Set()).add(b); };
  Object.entries(pairingsData || {}).forEach(([rnd, groups]) => {
    if (parseInt(rnd) >= beforeRound) return;
    (groups || []).forEach(grp => grp.forEach(a => grp.forEach(b => { if (a !== b) add(a, b); })));
  });
  return partners;
};

// Count intra-group pairs that were also partners in a prior round.
const countRepeatPairs = (groups, partners) => {
  let c = 0;
  groups.forEach(grp => {
    for (let i = 0; i < grp.length; i++)
      for (let j = i + 1; j < grp.length; j++)
        if (partners[grp[i]] && partners[grp[i]].has(grp[j])) c++;
  });
  return c;
};

const shuffleArr = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

const chunkBySizes = (order, sizes) => {
  const g = []; let k = 0;
  for (const s of sizes) { g.push(order.slice(k, k + s)); k += s; }
  return g;
};

// Partition playerIds into `numGroups` balanced groups minimizing the number of
// repeat-partner pairs. Randomized multi-start + swap hill-climb — fast and reliable
// for club-sized fields. NOTE: zero repeats is only achievable when the number of
// groups is >= the group size (e.g. threesomes with 4+ groups). With 12 players in
// foursomes the mathematical minimum is 3 forced repeat pairs (one per group), which
// this consistently finds. Returns { groups, repeats }.
const optimizeAvoidRepeats = (playerIds, numGroups, partners, restarts = 80) => {
  const sizes = balancedGroupSizes(playerIds.length, numGroups);
  let best = null, bestCost = Infinity;
  for (let r = 0; r < restarts; r++) {
    let groups = chunkBySizes(shuffleArr(playerIds), sizes);
    let cost = countRepeatPairs(groups, partners);
    let improved = true, guard = 0;
    while (improved && cost > 0 && guard++ < 500) {
      improved = false;
      outer:
      for (let gi = 0; gi < groups.length; gi++)
        for (let gj = gi + 1; gj < groups.length; gj++)
          for (let ai = 0; ai < groups[gi].length; ai++)
            for (let bj = 0; bj < groups[gj].length; bj++) {
              const A = groups[gi][ai], B = groups[gj][bj];
              groups[gi][ai] = B; groups[gj][bj] = A;
              const nc = countRepeatPairs(groups, partners);
              if (nc < cost) { cost = nc; improved = true; }
              else { groups[gi][ai] = A; groups[gj][bj] = B; }
              if (cost === 0) break outer;
            }
    }
    if (cost < bestCost) { bestCost = cost; best = groups.map(g => g.slice()); if (bestCost === 0) break; }
  }
  return { groups: best || chunkBySizes(playerIds.slice(), sizes), repeats: bestCost === Infinity ? 0 : bestCost };
};

// Group by leaderboard standings. `orderedPids` is best-first. leadersLast → the
// leaders land in the LAST group (latest tee time); otherwise they lead off first.
const groupByLeaderboard = (orderedPids, numGroups, leadersLast) => {
  const sizes = balancedGroupSizes(orderedPids.length, numGroups);
  const order = leadersLast ? orderedPids.slice().reverse() : orderedPids.slice();
  return chunkBySizes(order, sizes);
};

// Convert tee assignment rows → teeData format { round: { pid: teeName } }
const rowsToTeeData = (rows) => {
  const td = {};
  rows.forEach(r => {
    if (!td[r.round_number]) td[r.round_number] = {};
    td[r.round_number][r.player_id] = r.tee_name;
  });
  return td;
};

// The RECORDED course handicap, when a row carries one → { round: { pid: ch } }.
//
// Only imported editions have it (see lib/historyImport.js). The early WBCs set
// a handicap once and played it on every course, so those years cannot be
// re-derived from an index — the board reads this instead when it is present,
// and falls through to calcCH for the running tournament, which is every row
// this map comes out empty for.
const rowsToCourseHandicaps = (rows) => {
  const ch = {};
  rows.forEach(r => {
    if (!Number.isFinite(r.course_handicap)) return;
    if (!ch[r.round_number]) ch[r.round_number] = {};
    ch[r.round_number][r.player_id] = r.course_handicap;
  });
  return ch;
};

// Convert skins rows (skin_type "ctp") → ctpData { round: { holeNum: { playerId, distanceFt, distance, taggedByName } } }
// CTP is TOURNAMENT-WIDE: exactly one winner per par-3 per round, held by whichever
// group has tagged the closest ball so far. Later groups see the standing tag as the
// number to beat and can claim it — see the CTP prompt in OnCourseScoring.
const rowsToCtp = (rows) => {
  const cd = {};
  (rows || []).filter(r => r.skin_type === "ctp" && r.player_id).forEach(r => {
    const rnd = roundOf(r);
    if (!cd[rnd]) cd[rnd] = {};
    const ft = (r.distance_ft === 0 || r.distance_ft) ? r.distance_ft : null;
    cd[rnd][r.hole_number] = {
      playerId: r.player_id,
      distanceFt: ft,
      distance: r.distance || (ft ? `${ft} ft` : ""),
      taggedByName: r.tagged_by_name || "",
      // WHICH GROUP tagged it, and where that group tees off. The name alone
      // says who typed; this says where they were in the field, which is the
      // only way a group entering late can be told that the number in front
      // of them came from BEHIND them. Null on a director's override and on
      // any tag written before this was recorded — see lib/ctp, where an
      // unknown order deliberately says nothing.
      taggedGroupKey: r.tagged_group_key || null,
      taggedGroupOrder: Number.isInteger(r.tagged_group_order) ? r.tagged_group_order : null,
      // Who has walked off this green, seen the standing tag and let it
      // stand. See onConfirmCtp — it is the other half of the on-course
      // prompt, and the only record that a group answered rather than
      // never being asked.
      confirmedBy: Array.isArray(r.confirmed_by) ? r.confirmed_by : [],
    };
  });
  return cd;
};

// Convert market rows (skin_type "market") → [{ pid, opening: [{pid,shares}], mid: [...] }]
//
// The market rides in `skins` alongside the CTP tags rather than in a
// collection of its own, and that is a deliberate trade: `skins` is already
// subscribed, already scoped by tournament_id, already cleared by Start Fresh,
// and already member-writable in firestore.rules — which the market needs,
// because the person placing a bet is a player, not the director. A new
// collection would have been tidier and would have been inert until somebody
// deployed a rules change.
//
// Lots are normalised on the way in so a hand-edited document, a document
// written by an older bundle and a freshly saved one all read the same.
const rowsToMarket = (rows) =>
  (rows || [])
    .filter(r => r.skin_type === "market" && r.player_id)
    .map(r => ({
      pid: r.player_id,
      opening: normalizeLots(r.opening),
      mid: normalizeLots(r.mid),
    }))
    .sort((a, b) => String(a.pid).localeCompare(String(b.pid)));

// The side games' money, off tournament_state.side_games, with every field
// present whether or not the document carries it. `in` stays NULLISH when it
// has never been set — that is what "everybody" is — so this fills in the
// shape and deliberately does not fill in that answer.
//
// `rebuy` is the market's halfway window, and it is a BUY-IN of its own
// rather than a free top-up on the market seat: about half the field takes
// it and its money goes into the same market pot. It carries a PRICE here
// but no list — the ten shares are open to everybody in the market game and
// the debt is incurred by placing them, so who is in for it is read off the
// bets rather than tagged (see lib/market rebuyers). Keeping it as a fourth
// game is what puts it on the collection sheet as a column instead of the
// director holding "and also these six rebought" in their head.
const SIDE_GAME_KEYS = ["skins", "ctp", "lownet", "market", "rebuy"];
// The order and the wording the Betting tab's collection sheet uses. `short`
// has to fit a 38px column on a phone.
const SIDE_GAME_LABELS = {
  skins:  { label: "Skins",           short: "SKIN" },
  ctp:    { label: "Closest to Pin",  short: "CTP" },
  lownet: { label: "Low Net",         short: "NET" },
  market: { label: "Market",          short: "MKT" },
  rebuy:  { label: "Market rebuy",    short: "RE" },
};
const mergeSideGames = (raw) => {
  const out = {};
  SIDE_GAME_KEYS.forEach(k => {
    const g = (raw || {})[k] || {};
    out[k] = {
      amount: Number(g.amount) || 0,
      in: Array.isArray(g.in) ? g.in : null,
      // Who has actually handed the money over. Separate from `in` because
      // tagging the field and collecting from it are days apart, and unlike
      // `in` a missing list means NOBODY — paying is an affirmative act, so
      // there is no everybody-by-default here.
      paid: Array.isArray(g.paid) ? g.paid : [],
      // Skins is the only one with a hand-typed pot to preserve: it is the
      // game WBC was already playing before any of this existed.
      ...(k === "skins" ? { pot: Number(g.pot) || 0 } : {}),
    };
  });
  return out;
};

// Convert tee times rows → teeTimesData { round: [time, time, ...] }
// calcCH now lives in lib/individualBoard.js, alongside the net-to-par math it
// feeds, and is imported at the top of this file — one implementation for the
// leaderboard, the scorecards and the finalize preview alike.
const fmtPar = n => n == null ? "—" : n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`;

// Gap the tee sheet fills in with when the director types one group's time and
// the rest are still blank. A director who spaces two groups differently keeps
// their own spacing — this is only the starting assumption.
const TEE_INTERVAL_MIN = 10;

// ── SCORING GATE HELPERS ──
// Minutes before tee time that scoring input unlocks for non-directors.
const SCORING_LEAD_MIN = 30;
// Parse a tee-time display string ("8:00 AM") → minutes since midnight; null if unparseable.
const teeTimeToMinutes = (str) => {
  if (!str) return null;
  const match = String(str).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let h = parseInt(match[1]); const m = parseInt(match[2]);
  const ampm = (match[3] || "").toUpperCase();
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + m;
};
// Minutes since midnight → display time ("7:30 AM").
const minutesToTimeStr = (mins) => {
  if (mins == null) return "";
  const norm = ((mins % 1440) + 1440) % 1440;
  let h = Math.floor(norm / 60); const m = norm % 60;
  const ampm = h >= 12 ? "PM" : "AM"; if (h > 12) h -= 12; if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
};
// Local calendar date as YYYY-MM-DD — matches an <input type="date"> value.
const localDateISO = (d = new Date()) => {
  const y = d.getFullYear(); const mo = String(d.getMonth() + 1).padStart(2, "0"); const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
};
// Pretty round date ("Sat, Aug 15") from a YYYY-MM-DD string.
const fmtRoundDate = (iso) => {
  if (!iso) return "";
  const [y, mo, da] = iso.split("-").map(Number);
  if (!y || !mo || !da) return "";
  return new Date(y, mo - 1, da).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};
// Every day the event runs, start..end inclusive, as YYYY-MM-DD. This is what
// turns two dates typed once in Admin → Event into the only dates a round can
// be played on. Capped at 14: a longer span is a typo (2026 for 2027), and a
// mis-keyed year would otherwise try to render thousands of chips.
const tournamentDays = (start, end) => {
  if (!start) return [];
  const parse = (iso) => { const [y, mo, da] = String(iso).split("-").map(Number); return (y && mo && da) ? new Date(y, mo - 1, da) : null; };
  const a = parse(start);
  const b = parse(end) || a;
  if (!a || !b || b < a) return a ? [start] : [];
  const out = [];
  for (const d = new Date(a); d <= b && out.length < 14; d.setDate(d.getDate() + 1)) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
};
// Is score entry open right now for a given round + this group's tee time?
// Director → always open. Director "scoring open" toggle → open. Otherwise the
// automatic gate: opens SCORING_LEAD_MIN before tee time, on the round's scheduled date.
const isScoringOpen = ({ round, teeTime, roundDates, scoringOpen, isDirector }) => {
  if (isDirector) return true;
  if (scoringOpen && scoringOpen[round] === true) return true;
  const dateStr = roundDates && roundDates[round];
  if (!dateStr) return false;                    // no date set → closed until a director opens it
  if (dateStr !== localDateISO()) return false;  // round isn't today → closed
  const teeMin = teeTimeToMinutes(teeTime);
  if (teeMin == null) return false;              // no/invalid tee time → closed
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= teeMin - SCORING_LEAD_MIN;
};

// Resolve tee color from name — handles standard colors, non-standard colors, and word names
const TEE_COLOR_MAP = {
  black: "#2c2c2c", blue: "#2d8fd4", white: "#e8e8e8", gold: "#d4a843", red: "#9b2335",
  green: "#2d8a4e", silver: "#a8b2bd", yellow: "#e6c619", orange: "#e67e22", purple: "#7b2d8b",
  maroon: "#6b1c2a", navy: "#1b2a4a", teal: "#1a8a7a", tan: "#c4a86b", copper: "#b87333",
  bronze: "#cd7f32", champagne: "#f7e7ce", crimson: "#b22234", burgundy: "#800020",
  platinum: "#c0c0c0", pewter: "#8e8e8e", sand: "#c2b280", coral: "#ff7f50",
  tournament: "#1a1a2e", championship: "#1a1a2e", tips: "#1a1a2e", pro: "#2d8fd4", member: "#e8e8e8",
  ladies: "#c0392b", senior: "#d4a843", forward: "#d4a843", back: "#1a1a2e", middle: "#e8e8e8",
};
// Palette for unknown tee names (cycled by index)
const TEE_FALLBACK_COLORS = ["#5b8fb9", "#8b5e3c", "#6b7b3a", "#8e44ad", "#2e86ab", "#a84632"];
const resolveTeeColor = (tee, index) => {
  // Always check name first so known color names are normalized consistently
  const key = (tee.name || "").toLowerCase().trim();
  if (TEE_COLOR_MAP[key]) return TEE_COLOR_MAP[key];
  for (const [word, clr] of Object.entries(TEE_COLOR_MAP)) {
    if (key.includes(word)) return clr;
  }
  // Fall back to stored color only for unknown tee names
  if (tee.color && tee.color !== "#000" && tee.color !== "#000000") return tee.color;
  return TEE_FALLBACK_COLORS[index % TEE_FALLBACK_COLORS.length];
};
// Combo tee detection — splits "BLACK/BLUE" into ["#2c2c2c", "#2d8fd4"]
const getComboColors = (name) => {
  if (!name) return null;
  const separators = ["/", "-", "+", "&", " and "];
  for (const sep of separators) {
    const parts = name.split(new RegExp(`\\s*${sep.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\s*`, "i")).map(p => p.trim().toLowerCase());
    if (parts.length === 2 && parts[0] !== parts[1]) {
      const c1 = TEE_COLOR_MAP[parts[0]] || (parts[0].includes("black") ? "#2c2c2c" : null);
      const c2 = TEE_COLOR_MAP[parts[1]] || (parts[1].includes("white") ? "#e8e8e8" : null);
      if (c1 && c2) return [c1, c2];
    }
  }
  return null;
};

const isLightTee = (clr) => {
  if (!clr) return false;
  const light = ["#e8e8e8","#a8b2bd","#c0c0c0","#f7e7ce","#c2b280","#c4a86b","#8e8e8e"];
  return light.includes(clr.toLowerCase());
};
const isDarkTee = (clr) => {
  if (!clr) return false;
  const dark = ["#1a1a2e","#000000","#111111","#0a0a0a","#1a1a1a","#222222","#2c2c2c","#2d2d2d","#0d0d0d","black"];
  return dark.includes(clr.toLowerCase());
};
const isBlackTee = (clr) => isDarkTee(clr);

// Portal component — renders modal directly into document.body to escape all stacking contexts
const CoursePreviewPortal = ({ children }) => {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
};
// TeeColorSwatch — handles solid, combo (diagonal split), and black (gray+dot) tees
const TeeColorSwatch = ({ color, name, size = 12, style = {} }) => {
  const combo = getComboColors(name || "");
  if (combo) {
    const [c1, c2] = combo;
    const s = size;
    return (
      <span style={{ display: "inline-block", width: s, height: s, borderRadius: R.xs, overflow: "hidden", flexShrink: 0, border: "1px solid #ffffff20", ...style }}>
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <polygon points={`0,0 ${s},0 0,${s}`} fill={c1} />
          <polygon points={`${s},0 ${s},${s} 0,${s}`} fill={c2} />
        </svg>
      </span>
    );
  }
  if (isBlackTee(color)) {
    return <span style={{ display: "inline-block", width: size, height: size, borderRadius: R.xs, background: "#1a1a1a", border: "1px solid #666666", flexShrink: 0, ...style }} />;
  }
  const border = isLightTee(color) ? "1px solid #99999960" : "1px solid #ffffff15";
  return <span style={{ display: "inline-block", width: size, height: size, borderRadius: R.xs, background: color || "#888", border, flexShrink: 0, ...style }} />;
};


// Pick default tee: closest to slope 128 and 6400 yards (weighted combo)
const getDefaultTee = (tees) => {
  if (!tees || tees.length === 0) return null;
  let best = tees[0], bestScore = Infinity;
  tees.forEach(t => {
    const slopeDiff = Math.abs((t.slope || 113) - 127);
    const yardDiff = Math.abs((t.yardage || 6300) - 6300) / 50;
    const score = slopeDiff + yardDiff;
    if (score < bestScore) { bestScore = score; best = t; }
  });
  return best;
};

// K moved to src/theme.js when a second file needed it — see that file's
// header. Imported at the top; every read below is unchanged.

const TEE_PALETTE = ["#60a5fa","#f59e0b","#a78bfa","#34d399","#fb923c","#f472b6","#38bdf8","#e879f9"];

// ── LEADERBOARD ──

// The board's fixed column widths, in one place because TWO things read them:
// the grid template, and the measurement that centres Total under the trophy.
// They used to be literals in the template and a comment in the measurement,
// and the comment went stale — the # column had been widened from 24 to 36
// while the arithmetic still said 24, so Total sat a dozen pixels off the
// trophy it is supposed to line up with. Widths are sized to the widest string
// each column can hold at its font size, measured rather than guessed: Total
// takes the "STROKES" header (38px, the widest thing in that column — wider
// than any score), Thru takes a "12:10p" tee time at 28px, # takes "T12" plus
// a movement arrow at 32px.
//
// The round columns are NOT in here: they split whatever is left, four ways,
// so `prior` is only the floor below which "+11" stops fitting. Fixed widths
// plus a flexible gap is what made them look uneven — see LB_PAD_R.
const LB_COL = { num: 36, total: 40, thru: 34, priorMin: 24 };
// The rows are padded on the LEFT only. A round column's cell is read as the
// space between the two lines either side of it, and on the outside those
// lines are the band's edge and the board's edge — so any padding at the right
// edge is space the eye hands to R4, exactly as the gap column used to hand
// its width to R1. Ending the last column flush on the board's inner edge is
// what lets four equal tracks actually look equal.
const LB_PAD_L = 12;

function LeaderboardView({ lb, round, holeData, tRounds, courses, tPlayers, getPlayerTee, finalizedRounds, skinWins, pairingsData, teeTimesData, loaded = true }) {
  const [expanded, setExpanded] = useState(null);
  const [scorecardRound, setScorecardRound] = useState(null);
  const [showGross, setShowGross] = useState(false);
  const [showToPar, setShowToPar] = useState(true);
  // Reset to Net + To-Par whenever leaderboard mounts
  useEffect(() => { setShowGross(false); setShowToPar(true); }, []);
  const containerRef = useRef(null);
  const headerRef = useRef(null);
  const [rowStyle, setRowStyle] = useState({ padding: "6px 12px", fontSize: FS.small });
  const [rowMinH, setRowMinH] = useState(0);

  // Compute player column width to center Total, and align trophy to match.
  //
  // useLayoutEffect, not useEffect: this MEASURES the container and then
  // restyles from the measurement. useEffect runs after the browser has
  // painted, so the "auto" width below was painted first and the real width
  // one frame later — the player column visibly jumped from ~39px to ~122px
  // on every mount, which is what the pull-to-refresh flash was. Laying out
  // synchronously before paint means the wrong layout is never shown.
  const [playerColW, setPlayerColW] = useState("auto");
  useLayoutEffect(() => {
    const align = () => {
      if (!containerRef.current) return;
      // offsetWidth counts the board's own 1px border on each side; inside it
      // the rows are padded on the left only, and run to the board's inner edge
      // on the right.
      const containerW = containerRef.current.offsetWidth;
      const innerW = containerW - 2;          // inside the board's border
      const gridW = innerW - LB_PAD_L;        // the row's content box
      // Total's centre sits at padL + num + playerW + total/2 from the board's
      // inner edge, and the board is centred in the viewport — so putting that
      // at the board's own midpoint puts it under the trophy behind it. The
      // padding is one-sided now, so it has to be in this sum rather than
      // cancelling out of it.
      const centred = innerW / 2 - LB_PAD_L - LB_COL.num - LB_COL.total / 2;
      // On a narrow phone the fixed columns want more than half the width, and
      // honouring the centring would squeeze the round columns below the width
      // a "+11" needs. So centred is a CEILING, not a rule: the player column
      // gives way first, and Total drifts off the trophy rather than the round
      // columns becoming unreadable.
      const fixed = LB_COL.num + LB_COL.total + LB_COL.thru + LB_COL.priorMin * NUM_ROUNDS;
      const playerW = Math.max(60, Math.min(centred, gridW - fixed));
      setPlayerColW(`${Math.floor(playerW)}px`);
    };
    align();
    const t = setTimeout(align, 150);
    window.addEventListener("resize", align);
    return () => { clearTimeout(t); window.removeEventListener("resize", align); };
  }, [lb.length]);

  // Track previous positions for movement arrows
  const prevPositions = useRef({});
  const [movements, setMovements] = useState({});
  useEffect(() => {
    const newMov = {};
    lb.forEach((p, idx) => {
      const prev = prevPositions.current[p.id];
      if (prev != null && prev !== idx) newMov[p.id] = prev > idx ? "up" : "down";
    });
    setMovements(newMov);
    const newPos = {};
    lb.forEach((p, idx) => { newPos[p.id] = idx; });
    prevPositions.current = newPos;
  }, [lb.map(p => p.id).join(",")]);

  // Row styles handled via CSS flex — rowStyle kept for font size only.
  // useLayoutEffect for the same reason as the column measurement above: this
  // reads the rendered height and rewrites the row font size and padding from
  // it, so running it after paint shows one frame at the pre-measurement size.
  useLayoutEffect(() => {
    const calc = () => {
      if (!containerRef.current || !headerRef.current || lb.length === 0) return;
      // Use the container's own bounding rect — it already lives inside the padded content area
      const containerRect = containerRef.current.getBoundingClientRect();
      const headerH = headerRef.current.offsetHeight;
      // Available = space from bottom of grid header to bottom of container
      const available = containerRect.height - headerH;
      const perRow = Math.floor(available / lb.length);
      const clampedPerRow = Math.min(perRow, 36);
      // The rung the whole row is built from: the name and Total sit one above
      // it, Thru and the round columns one below. A full field on a short
      // screen drops the lot back a rung rather than clipping.
      //
      // A rung lower than it looks like it should be, because px type is not
      // px on a phone. Android's system font-size setting multiplies every
      // font-size in the WebView — but not the column widths beside them, which
      // are layout and stay put. So the board has to be drawn small enough that
      // it still fits AFTER the user's own setting has stretched it. Measured
      // against the real roster in uppercase: built on FS.body the names began
      // clipping at 1.15x on a 360 phone, which is the first notch a lot of
      // people are already on. Built on FS.small they survive that everywhere
      // and 1.3x on a 390.
      const fSize = clampedPerRow >= 26 ? FS.small : FS.label;
      // Same object identity when the numbers have not moved, so the delayed
      // re-measure below is free unless it actually found a different layout.
      setRowStyle(prev => (prev.fontSize === fSize && prev.lineHeight === 1 && prev.padding === undefined)
        ? prev : { fontSize: fSize, lineHeight: 1 });
      setRowMinH(perRow);
    };
    calc();
    const t = setTimeout(calc, 100);
    window.addEventListener("resize", calc);
    return () => { clearTimeout(t); window.removeEventListener("resize", calc); };
  }, [lb.length]);

  // What the Thru column is counting right now — see lib/thruStatus. The round
  // is "in play" from the first score anyone posts until the director
  // finalizes, and for that whole stretch the column is about TODAY: holes into
  // this round for anyone who has teed off, the group's tee time for anyone who
  // hasn't. Outside it, the tournament total.
  const inPlay = roundInPlay(lb, round, finalizedRounds[round]);
  // The board stops being a running total and becomes a RESULT the moment the
  // director finalizes the last round. Nothing else marks the end of a
  // tournament — scores can still be corrected up to that point.
  const tournamentOver = !!finalizedRounds[NUM_ROUNDS];
  const teeTimes = useMemo(
    () => teeTimesByPlayer((pairingsData || {})[round], (teeTimesData || {})[round]),
    [pairingsData, teeTimesData, round],
  );

  const renderScorecard = (p) => {
    const tp = tPlayers.find(t => t.player_id === p.id);
    const hi = parseFloat(tp?.handicap_index) || 0;
    // Find rounds with scores
    const availRounds = [];
    for (let r = 1; r <= NUM_ROUNDS; r++) {
      const tr = tRounds.find(t => t.round_number === r);
      if (!tr) continue;
      const course = courses.find(c => c.id === tr.course_id);
      if (!course) continue;
      const key = `${p.id}_${r}`;
      const scores = holeData[key] || {};
      if (Object.keys(scores).length === 0) continue;
      availRounds.push(r);
    }
    if (availRounds.length === 0) return <div style={{ padding: 12, fontSize: FS.small, color: K.t2 }}>No scores yet</div>;

    const viewRound = scorecardRound && availRounds.includes(scorecardRound) ? scorecardRound : availRounds[availRounds.length - 1];
    const tr = tRounds.find(t => t.round_number === viewRound);
    const course = courses.find(c => c.id === tr.course_id);
    const key = `${p.id}_${viewRound}`;
    const scores = holeData[key] || {};
    const holePars = course.hole_pars || [];
    const holeHcps = course.hole_handicaps || [];
    const tee = getPlayerTee(viewRound, p.id, course);
    const ch = calcCH(hi, tee?.slope || course.slope, tee?.rating || course.rating, tee?.par || course.par);
    const sorted = holeHcps.map((h, i) => ({ idx: i, hcp: h })).sort((a, b) => a.hcp - b.hcp);
    const strokeMap = {};
    let rem = Math.abs(ch);
    for (let pass = 0; pass < 3 && rem > 0; pass++) {
      for (const h of sorted) { if (rem <= 0) break; strokeMap[h.idx] = (strokeMap[h.idx] || 0) + 1; rem--; }
    }
    const frontPar = holePars.slice(0,9).reduce((a,b)=>a+b,0);
    const backPar = holePars.slice(9).reduce((a,b)=>a+b,0);
    let frontGross = 0, backGross = 0, frontNet = 0, backNet = 0;
    for (let h = 0; h < 18; h++) {
      if (scores[h]) {
        const g = scores[h];
        const st = strokeMap[h] || 0;
        if (h < 9) { frontGross += g; frontNet += (g - st); } else { backGross += g; backNet += (g - st); }
      }
    }
    const rc = { r: viewRound, course, holePars, scores, strokeMap, ch, frontPar, backPar, frontGross, backGross, frontNet, backNet, tee };

    const totalGross = rc.frontGross + rc.backGross;
    const totalNet = rc.frontNet + rc.backNet;
    const totalPar = rc.frontPar + rc.backPar;
    const netToPar = totalNet - totalPar;

    return (
      <div style={{ padding: "8px 10px 8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {availRounds.length > 1 ? (
              <select value={viewRound} onChange={e => setScorecardRound(parseInt(e.target.value))} onClick={e => e.stopPropagation()} style={{
                background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: R.xs, color: K.acc, fontSize: FS.label, fontWeight: 700, padding: "2px 4px", cursor: "pointer",
              }}>
                {availRounds.map(r => {
                  const c = courses.find(cs => cs.id === tRounds.find(t => t.round_number === r)?.course_id);
                  return <option key={r} value={r}>Rd {r}: {c?.name || "—"}</option>;
                })}
              </select>
            ) : (
              <span style={{ fontSize: FS.label, fontWeight: 700, color: K.acc }}>Rd {rc.r}: {rc.course.name}</span>
            )}
            <span style={{ fontSize: FS.micro, color: K.t2 }}>CH {rc.ch}</span>
          </div>
          <div style={{ display: "flex", gap: 8, fontSize: FS.label }}>
            <span style={{ color: K.t2 }}>Gross <strong style={{ color: K.t1 }}>{totalGross || "—"}</strong></span>
            <span style={{ color: K.t2 }}>Net <strong style={{ color: netToPar < 0 ? K.under : K.t1 }}>{totalNet || "—"}</strong></span>
          </div>
        </div>
            {[["Front", 0, 9, rc.frontPar, rc.frontGross], ["Back", 9, 9, rc.backPar, rc.backGross]].map(([label, start, count, parT, grossT]) => (
              <div key={label} style={{ marginBottom: 4 }}>
                <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 32px`, gap: 1, fontSize: FS.micro }}>
                  <div style={{ color: K.t2, fontWeight: 600, padding: "2px 0" }}></div>
                  {Array.from({length: count}, (_, i) => start + i).map(h => (
                    <div key={h} style={{ textAlign: "center", color: K.t2, fontWeight: 600, padding: "2px 0" }}>{h+1}</div>
                  ))}
                  <div style={{ textAlign: "center", color: K.t2, fontWeight: 700 }}></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 32px`, gap: 1, fontSize: FS.micro }}>
                  <div style={{ color: K.t2, padding: "2px 0", fontSize: FS.micro }}>Par</div>
                  {Array.from({length: count}, (_, i) => start + i).map(h => (
                    <div key={h} style={{ textAlign: "center", color: K.t2, padding: "2px 0" }}>{rc.holePars[h]}</div>
                  ))}
                  <div style={{ textAlign: "center", color: K.t2, fontWeight: 700 }}>{parT}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 32px`, gap: 1 }}>
                  <div style={{ color: K.t2, padding: "3px 0", fontSize: FS.micro, fontWeight: 600 }}>Scr</div>
                  {Array.from({length: count}, (_, i) => start + i).map(h => {
                    const s = rc.scores[h];
                    const d = s ? s - rc.holePars[h] : null;
                    const st = rc.strokeMap[h] || 0;
                    const isSkin = skinWins[`${rc.r}_${h}`] === p.id;
                    const clr = isSkin ? K.gold : K.t2;
                    return (
                      <div key={h} style={{
                        textAlign: "center", fontSize: FS.label, fontWeight: 700, padding: "1px 0",
                        position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
                        height: 22,
                      }}>
                        {s && d !== 0 && d != null && (
                          <div style={{ position: "absolute", width: 20, height: 20, left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>
                            <div style={{ position: "absolute", inset: 0, borderRadius: d < 0 ? "50%" : R.xs, border: `1.5px solid ${clr}` }} />
                            {(d <= -2 || d >= 2) && <div style={{ position: "absolute", inset: 3, borderRadius: d < 0 ? "50%" : R.xs, border: `1px solid ${clr}` }} />}
                          </div>
                        )}
                        <span style={{ position: "relative", zIndex: 1, color: isSkin ? K.gold : K.t2 }}>
                          {s || "·"}
                          {st > 0 && <span style={{ position: "absolute", top: -1, left: "100%", display: "flex", gap: 1, paddingLeft: 1 }}>
                            {Array.from({length: st}).map((_, i) => <span key={i} style={{ width: 3, height: 3, borderRadius: "50%", background: K.acc, display: "block" }} />)}
                          </span>}
                        </span>
                      </div>
                    );
                  })}
                  <div style={{ textAlign: "center", fontSize: FS.small, fontWeight: 800, color: K.t2, display: "flex", alignItems: "center", justifyContent: "center", height: 22 }}>{grossT || ""}</div>
                </div>
              </div>
            ))}
      </div>
    );
  };

  return (
    <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Giant trophy silhouette behind entire leaderboard — fixed so it never shifts */}
      <img src={WBC_TROPHY_SILHOUETTE} alt="" style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: 480, height: "100vh",
        maxWidth: "100vw",
        opacity: 0.08,
        pointerEvents: "none",
        userSelect: "none",
        zIndex: 0,
        objectFit: "contain",
      }} />
      <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Title inline with stacked pills */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10, gap: 8 }}>
        {/* Left pill — Net/Gross */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
          <div onClick={() => setShowGross(g => !g)} style={{
            display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none",
            background: K.bdr + ALPHA.tint, borderRadius: R.pill, padding: "2px 3px", gap: 1,
          }}>
            {/* The unselected label was t3 held back to 53% — under 2:1 on
                this background, so the option you were NOT on was the one you
                could not read. Off is plain t3 and on is t1: the same on/off
                gap, both legible. */}
            {[["Net", false], ["Gross", true]].map(([label, val]) => (
              <span key={label} style={{
                fontSize: FS.micro, fontWeight: 600, padding: "2px 0", borderRadius: R.xl,
                width: 30, textAlign: "center",
                background: showGross === val ? K.t3 + ALPHA.hair : "transparent",
                color: showGross === val ? K.t1 : K.t3,
                transition: `background ${MOTION}, color ${MOTION}`,
              }}>{label}</span>
            ))}
          </div>
        </div>
        {/* Center — title */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: FS.title, margin: 0, fontWeight: 800 }}>Leaderboard</h2>
          {(() => {
            // No FINAL badge beside the title: the trophy on position 1 says
            // the tournament is decided, and saying it twice on one screen
            // only competes with itself.
            //
            // The round still has to be UNfinalized for LIVE, which is what
            // the badge used to establish by returning before this line. A
            // finalized round can still hold a card that stops short — a
            // withdrawal, a group that signed at 14 — and a partial card in a
            // closed round is not play in progress.
            const live = !finalizedRounds[round]
              && lb.some(p => !p.isWD && p.rds?.[round - 1]?.thru > 0 && p.rds[round - 1].thru < 18);
            if (!live) return null;
            return (
              <>
                <style>{`@keyframes wbcLivePulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: R.md, background: K.danger + ALPHA.wash, border: "1px solid #ef444440" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: K.danger, animation: "wbcLivePulse 1.5s ease-in-out infinite" }} />
                  <span style={{ fontSize: FS.micro, fontWeight: 800, color: K.danger, letterSpacing: ".08em" }}>LIVE</span>
                </span>
              </>
            );
          })()}
        </div>
        {/* Right pill — Par/Total */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <div onClick={() => setShowToPar(v => !v)} style={{
            display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none",
            background: K.bdr + ALPHA.tint, borderRadius: R.pill, padding: "2px 3px", gap: 1,
          }}>
            {[["Par", true], ["Total", false]].map(([label, val]) => (
              <span key={label} style={{
                fontSize: FS.micro, fontWeight: 600, padding: "2px 0", borderRadius: R.xl,
                width: 30, textAlign: "center",
                background: showToPar === val ? K.t3 + ALPHA.hair : "transparent",
                color: showToPar === val ? K.t1 : K.t3,
                transition: `background ${MOTION}, color ${MOTION}`,
              }}>{label}</span>
            ))}
          </div>
        </div>
      </div>
      <div ref={containerRef} style={{ background: "transparent", borderRadius: R.lg, border: `1px solid ${K.bdr}`, overflow: "hidden", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {/* Build dynamic grid: #, Player, Total, Thru, then one equal track per round */}
        {(() => {
          const allPriorRounds = Array.from({ length: NUM_ROUNDS }, (_, i) => i + 1);
          // Four EQUAL tracks filling everything left over, instead of four
          // fixed ones with a flexible gap in front. The gap column made R1's
          // cell — the space between the band's edge and the first rule — the
          // width of a round plus the gap, and the row's right padding did the
          // same for R4 against the board's edge. On a 390 phone that read as
          // 100 / 55 / 56 / 83 against tracks that were all exactly 24: the
          // arithmetic was even and the board was not.
          const gridCols = `${LB_COL.num}px ${playerColW} ${LB_COL.total}px ${LB_COL.thru}px${allPriorRounds.map(() => " 1fr").join("")}`;
          const gridStyle = { display: "grid", gridTemplateColumns: gridCols, alignItems: "center" };
          // Total and Thru are drawn as one band running the whole height of
          // the board rather than as numbers sitting loose in each row. Every
          // row paints its own slice — full-bleed top to bottom — and the
          // slices stack into one continuous block, so where a player stands
          // and how far in they are read together, boxed off from the
          // round-by-round detail either side. The hairline is on the OUTER
          // edge of each end only: a rule between Total and Thru would split
          // the band back into two columns, which is what it exists to undo.
          // Inset shadows rather than borders for the same reason the round
          // columns use them — a border is width, and Total is the column the
          // whole board is aligned to. Drawn as a border it pushed its own
          // number half a pixel off the trophy behind it.
          const bandStart = {
            alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center",
            background: K.t3 + ALPHA.wash, boxShadow: `inset 1px 0 0 ${K.bdr}`,
          };
          const bandEnd = { ...bandStart, boxShadow: `inset -1px 0 0 ${K.bdr}` };
          // Ruling between the round columns, so four numbers in a row read as
          // four rounds rather than one string of digits. Full-strength K.bdr,
          // the same rule the card edge and the header divider are drawn in:
          // held back to a third of that it computed to 1.08:1 against the
          // background, which is a line that exists in the stylesheet and not
          // on the screen. The band still leads on its background tint rather
          // than on having a heavier edge. None on R1 — its left edge is
          // already the gap.
          //
          // Drawn as an inset shadow rather than a border because a border is
          // LAYOUT. Under border-box it ate a pixel off the left of every cell
          // that had one, which R1 did not — so R1 centred its number in 24px
          // while R2-R4 centred theirs in 23px starting a pixel over, and the
          // four columns came out spaced 24.5, 24, 24. The same pixel pushed
          // every number half a pixel right of its own track, giving each cell
          // 12.5 of air on one side of its value and 11.5 on the other. A
          // shadow paints the identical line and costs no width, so all four
          // tracks are the same box and the numbers sit dead centre in them.
          const roundCell = (i) => ({
            alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: i === 0 ? undefined : `inset 1px 0 0 ${K.bdr}`,
          });
          return (
            <>
              {/* The one row that does NOT step up with the rest of the board.
                  These are eyebrows, not data, and "STROKES" already fills the
                  Total column at micro — a rung up and it spills over the band
                  it is supposed to cap. */}
              <div ref={headerRef} style={{ ...gridStyle, padding: `7px 0 7px ${LB_PAD_L}px`, fontSize: FS.micro, fontWeight: 600, color: K.t2, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${K.bdr}` }}>
                <span>#</span>
                <span>Player</span>
                {/* Negative margin eats the header's own padding so the band
                    starts at the top edge instead of 7px down from it. */}
                {(() => {
                  const label = showGross ? "Gross" : showToPar ? "Total" : "Strokes";
                  // "STROKES" is two letters longer than the other two labels
                  // and fills the column on its own; the eyebrow tracking is
                  // what tips it out over the band's hairline. The long label
                  // goes untracked rather than the column growing for a word
                  // only one of the three toggle states ever shows.
                  return <span style={{ ...bandStart, margin: "-7px 0", padding: "7px 0", fontWeight: 700, color: K.t2, letterSpacing: label.length > 5 ? 0 : undefined }}>{label}</span>;
                })()}
                <span style={{ ...bandEnd, margin: "-7px 0", padding: "7px 0", fontWeight: 700, color: K.t2 }}>Thru</span>
                {allPriorRounds.map((r, i) => <span key={r} style={{ ...roundCell(i), margin: "-7px 0", padding: "7px 0" }}>R{r}</span>)}
              </div>
              {/* Only once the round data is actually in. An empty `lb` also means
                  "Firestore has not answered yet", and reporting that as "no scores"
                  flashed the message up on every reload before the board arrived. */}
              {lb.length === 0 && (loaded
                ? <div style={{ padding: 24, textAlign: "center", color: K.t2, fontSize: FS.small }}>No scores yet — be the first!</div>
                : <div style={{ padding: 24, textAlign: "center", color: K.t3, fontSize: FS.small, opacity: 0.5 }}>&nbsp;</div>)}
              <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: expanded ? "auto" : "hidden" }}>
              {(() => {
                // Pre-compute tied positions
                const posMap = {};
                let i = 0;
                while (i < lb.length) {
                  if (lb[i].roundsPlayed === 0) { posMap[lb[i].id] = i + 1; i++; continue; }
                  let j = i + 1;
                  while (j < lb.length && lb[j].roundsPlayed > 0 && lb[j].totalNetToPar === lb[i].totalNetToPar) j++;
                  const tied = j - i > 1;
                  for (let k = i; k < j; k++) posMap[lb[k].id] = tied ? `T${i + 1}` : i + 1;
                  i = j;
                }
                const rows = lb.map((p, idx) => {
                const pos = posMap[p.id] ?? idx + 1;
                const top3 = pos === 1 || pos === "T1";
                // A tie at the top stays a tie: both rows get the trophy rather
                // than the board picking a champion out of sort order, which is
                // a decision the scores have not made.
                const isChampion = tournamentOver && top3 && !p.isWD && p.roundsPlayed > 0;
                const isExpanded = expanded === p.id;
                const mov = movements[p.id];
                const displayTotal = showGross
                  ? (() => {
                      let g = 0;
                      for (let r = 1; r <= NUM_ROUNDS; r++) {
                        const scores = holeData[`${p.id}_${r}`] || {};
                        Object.values(scores).forEach(s => { g += s; });
                      }
                      return g > 0 ? g : null;
                    })()
                  : showToPar
                    ? (p.roundsPlayed > 0 ? p.totalNetToPar : null)
                    : (() => {
                        // Net total strokes across all rounds
                        let netTotal = 0; let hasAny = false;
                        for (let r = 1; r <= NUM_ROUNDS; r++) {
                          const prRd = p.rds[r - 1];
                          if (prRd && !prRd.wd && prRd.netToPar != null) {
                            const tr2 = tRounds.find(t => t.round_number === r);
                            const c2 = tr2 ? courses.find(c => c.id === tr2.course_id) : null;
                            const par2 = c2?.hole_pars?.reduce((a,b) => a+b, 0) || 72;
                            netTotal += prRd.netToPar + par2;
                            hasAny = true;
                          }
                        }
                        return hasAny ? netTotal : null;
                      })();
                return (
                  <div key={p.id} style={{ flex: isExpanded ? "0 0 auto" : 1, minHeight: (expanded && !isExpanded) ? rowMinH : 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <div onClick={() => { setExpanded(isExpanded ? null : p.id); setScorecardRound(null); }} style={{ ...gridStyle, padding: `0 0 0 ${LB_PAD_L}px`, minHeight: 28, height: "100%", alignItems: "center", borderBottom: `1px solid ${K.bdr}${ALPHA.wash}`, background: "transparent", cursor: "pointer", fontSize: rowStyle.fontSize, lineHeight: 1 }}>
                      {/* # */}
                      <span style={{ fontWeight: 800, fontSize: rowStyle.fontSize, color: top3 ? K.acc : K.t2, display: "flex", alignItems: "center", gap: 1 }}>
                        {isChampion
                          ? <img src={WBC_TROPHY} alt="Champion" title="Champion" style={{ height: fsStep(rowStyle.fontSize, 2), display: "block" }} />
                          : pos}
                        {/* Stays at micro while the rest of the row steps up:
                            "T12" plus an arrow is what sizes the # column, and
                            a bigger glyph pushes the pair past its width. */}
                        {mov && <span style={{ fontSize: FS.micro, color: mov === "up" ? K.ok : K.danger, lineHeight: 1 }}>{mov === "up" ? "▲" : "▼"}</span>}
                      </span>
                      {/* Player — a rung above the fitted row size. The name is
                          what you scan the board for, and at the row size it
                          was reading as one column of many. */}
                      <div style={{ fontWeight: isChampion ? 800 : 600, color: isChampion ? K.acc : undefined, fontSize: fsStep(rowStyle.fontSize, 1), display: "flex", alignItems: "center", gap: 3, overflow: "hidden", paddingRight: 4 }}>
                        {/* flex:1 on the name is what parks the chevron on the
                            right edge of the column instead of trailing the
                            last letter — with names of six or seven characters
                            it was landing in a different place on every row.
                            minWidth:0 keeps the ellipsis working inside a flex
                            item that is now allowed to grow. */}
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                        {/* FS.micro flat, not a step off the row size: this is
                            an affordance, not data, and stepping it meant it
                            grew whenever the board had room to grow — which is
                            backwards for the quietest mark in the row.
                            Micro is the bottom of the type scale and this still
                            wants to be smaller, so the last bit comes off the
                            MARK rather than the type: the rung stays on the
                            ladder and scale() takes the glyph to about 6px.
                            Sizing it as type instead would have put a number
                            below the scale's floor into the file, which is the
                            drift the scale exists to stop — and a transform
                            costs no layout, so the gutter to the band stays put
                            whatever the glyph does. Below ~0.6 the triangle
                            stops reading as one and turns into a dot. */}
                        <span style={{ fontSize: FS.micro, flexShrink: 0, color: isExpanded ? K.acc : K.t2, transition: `transform ${MOTION}`, display: "inline-block", transform: `${isExpanded ? "rotate(180deg)" : "rotate(0)"} scale(0.75)` }}>▼</span>
                      </div>
                      {/* Total */}
                      {/* Full-strength ink, not the t2 the row's other numbers
                          take: under par still prints red, everything else is
                          the brightest thing in the row. */}
                      <span style={{ ...bandStart, fontWeight: 800, fontSize: fsStep(rowStyle.fontSize, 1), color: p.isWD || displayTotal == null ? K.t2 : (!showGross && showToPar && displayTotal < 0 ? K.under : K.t1) }}>
                        {p.isWD ? <span style={{ fontSize: fsStep(rowStyle.fontSize, -1), color: K.t2, fontWeight: 700 }}>WD</span> : displayTotal != null ? (showGross || !showToPar ? displayTotal : fmtPar(displayTotal)) : "—"}
                      </span>
                      {/* Thru — today's holes while the round is being played,
                          the tournament total once it is finalized. A tee time
                          drops a rung: it is the one value here that isn't a
                          hole count, and it has more characters to fit. */}
                      {(() => {
                        const st = thruStatus({
                          inPlay,
                          roundThru: p.rds[round - 1]?.thru || 0,
                          totalThru: p.totalThru,
                          teeTime: teeTimes[p.id],
                          isWD: p.isWD,
                        });
                        return (
                          <span style={{
                            ...bandEnd,
                            fontSize: fsStep(rowStyle.fontSize, st.kind === "tee" ? -2 : -1),
                            color: K.t2,
                            // The one cell the app-wide caps have to sit out.
                            // teeTimeLabel lowercases the meridiem to make a
                            // time fit this column, and it fits by a third of a
                            // pixel: "10:24a" measures 33.7 against a 34px
                            // track, "10:24A" measures 34.9 and crosses the
                            // band's right-hand rule. Two rungs down is already
                            // as small as this value goes, so the case is the
                            // only thing left to give.
                            textTransform: st.kind === "tee" ? "none" : undefined,
                          }}>
                            {st.text}
                          </span>
                        );
                      })()}
                      {/* Prior rounds — always show all 4 */}
                      {allPriorRounds.map((r, i) => {
                        const prRd = p.rds[r - 1];
                        const isWDRound = prRd?.wd;
                        const prVal = isWDRound ? null : showGross
                          ? (() => { const scores = holeData[`${p.id}_${r}`] || {}; const g = Object.values(scores).filter(s => s !== 99).reduce((a,b) => a+b, 0); return g > 0 ? g : null; })()
                          : showToPar
                            ? prRd?.netToPar
                            : (() => {
                                if (!prRd || prRd.netToPar == null) return null;
                                const tr2 = tRounds.find(t => t.round_number === r);
                                const c2 = tr2 ? courses.find(c => c.id === tr2.course_id) : null;
                                const par2 = c2?.hole_pars?.reduce((a,b) => a+b, 0) || 72;
                                return prRd.netToPar + par2;
                              })();
                        // These carried an opacity on top of an already-dim t3,
                        // which put a played round at under 2:1 against the
                        // background — a number you could see was there without
                        // being able to read it. The ink alone sets them back
                        // now: t2 for a round played, t3 for the dash standing
                        // in for one that wasn't.
                        return (
                          <span key={r} style={{ ...roundCell(i), fontSize: fsStep(rowStyle.fontSize, -1), color: prVal != null && !showGross && showToPar && prVal < 0 ? K.under : isWDRound || prVal == null ? K.t3 : K.t2 }}>
                            {isWDRound ? "WD" : prVal != null ? (showGross || !showToPar ? prVal : fmtPar(prVal)) : "—"}
                          </span>
                        );
                      })}
                    </div>
                    {isExpanded && (
                      <div style={{ borderBottom: `1px solid ${K.bdr}${ALPHA.hair}`, background: K.bg + ALPHA.panel }}>
                        {renderScorecard(p)}
                      </div>
                    )}
                  </div>
                );
              });
                return <>{rows}</>;
              })()}
              </div>
            </>
          );
        })()}
      </div>
      </div>
    </div>
  );
}

// ── NINE CARD ──

// ═══════════════════════════════════════════════════════════════
//  Haptic feedback helpers (ported from MnQ league Scoring)
// ═══════════════════════════════════════════════════════════════
// navigator.vibrate is supported on Android + recent iOS PWAs; no-ops elsewhere.
//   • tapScore     — single 10ms blip for entering a hole score
//   • tapNudge     — 8ms blip for the +/− nudge buttons (lighter)
//   • tapBigAction — three-pulse pattern for big moments (sign, attest)
function tapScore()     { if (typeof navigator !== "undefined" && navigator.vibrate) try { navigator.vibrate(10); } catch {} }
function tapNudge()     { if (typeof navigator !== "undefined" && navigator.vibrate) try { navigator.vibrate(8); } catch {} }
function tapBigAction() { if (typeof navigator !== "undefined" && navigator.vibrate) try { navigator.vibrate([20, 40, 20]); } catch {} }

// Labels sit beneath the 5 par-relative buttons [par-1, par, par+1, par+2, par+3].
const SCORE_LABELS = ["Birdie", "Par", "Bogey", "Double", "Triple"];

// ═══════════════════════════════════════════════════════════════
//  ScoreButtonRow — par-relative score control (ported from league)
// ═══════════════════════════════════════════════════════════════
// 5 par-relative buttons that recenter around par, flanked by −/+ nudge
// buttons. Birdie/Par/Bogey/Double/Triple labels render beneath. Tapping the
// selected score again clears it (onPick(0)). 44px touch targets per Apple HIG.
function ScoreButtonRow({ score, par, onPick }) {
  // Window and ± targets live in lib/scoreEntry — see the header there for
  // why a cold + opens past the top of the row rather than on a bogey.
  const { btns, shifted } = scoreWindow(par, score);
  // A shifted window would mislabel its buttons (an ace on a par 3 is not a
  // "Birdie"), so the labels drop out but keep their 12px slot — the row
  // height has to stay put.
  const showLabels = !shifted;
  const boxSize = 32;
  const handleNudge = (val) => { tapNudge(); onPick(Math.max(1, val)); };
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "flex-start" }}>
      <button onClick={() => handleNudge(nudgeDownTarget(score, par))} style={{ width: 36, height: 44, borderRadius: R.sm, background: K.inp, border: "none", color: K.t3, fontSize: FS.body, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>−</button>
      {btns.map((btn, idx) => {
        const isCur = btn === score; const sd = btn - par;
        const isPar = btn === par;
        const showParAnchor = isPar && !isCur;
        const ringClr = sd < 0 ? K.danger : K.bg;
        return (
          <div key={btn} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
            {/* A rung above FS.body, unlike the ± either side of it. This is
                the number the whole screen exists to read and to hit, it sits
                in a 44px box with room to spare, and it is read at arm's
                length in sun. Nothing reflows: the box height is fixed. */}
            <button onClick={() => { tapScore(); onPick(isCur ? 0 : btn); }} style={{ width: "100%", height: 44, borderRadius: R.sm, cursor: "pointer", fontSize: FS.lead, fontWeight: 800, border: "none", background: isCur ? K.acc : K.inp, color: isCur ? K.bg : K.t2, position: "relative", transition: `all ${MOTION}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {/* Selected-state rings: circles under par, squares over par */}
              {isCur && sd !== 0 && <div style={{ position: "absolute", width: boxSize, height: boxSize, left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}><div style={{ position: "absolute", inset: 0, borderRadius: sd < 0 ? "50%" : R.xs, border: `1.5px solid ${ringClr}` }} />{Math.abs(sd) >= 2 && <div style={{ position: "absolute", inset: 3, borderRadius: sd < 0 ? "50%" : R.xs, border: `1px solid ${ringClr}` }} />}</div>}
              {/* Resting-state faint outlines on non-par, non-selected buttons */}
              {!isCur && sd !== 0 && <div style={{ position: "absolute", width: boxSize, height: boxSize, left: "50%", top: "50%", transform: "translate(-50%, -50%)", opacity: 0.15 }}><div style={{ position: "absolute", inset: 0, borderRadius: sd < 0 ? "50%" : R.xs, border: `1.25px solid ${sd < 0 ? K.danger : K.t2}` }} />{Math.abs(sd) >= 2 && <div style={{ position: "absolute", inset: 3, borderRadius: sd < 0 ? "50%" : R.xs, border: `1px solid ${sd < 0 ? K.danger : K.t2}` }} />}</div>}
              <span style={{ position: "relative", zIndex: 1 }}>{btn}</span>
            </button>
            <div style={{ fontSize: FS.micro, color: showParAnchor ? K.t2 : K.t3, fontWeight: showParAnchor ? 700 : 600, letterSpacing: 0.4, lineHeight: 1, height: 12 }}>
              {showLabels ? SCORE_LABELS[idx] : ""}
            </div>
          </div>
        );
      })}
      <button onClick={() => handleNudge(nudgeUpTarget(score, par))} style={{ width: 36, height: 44, borderRadius: R.sm, background: K.inp, border: "none", color: K.t3, fontSize: FS.body, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>+</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Popup — shared modal chrome (backdrop + centered card)
// Popup moved to components/Popup.jsx (alongside ConfirmModal, which builds on
// it) and is imported at the top of this file. Behavior is unchanged for every
// caller below; the extracted version adds an opt-in `portal` prop.

// ── ON-COURSE SCORING (replaces old ScoringView) ──
// Flow: Group Setup → Hole-by-hole for entire group → auto-advance
// ── The bar for "you are not on the live hole" ──
// Two states, half a tap apart: the hole is already scored, and you have
// chosen to edit it. They were drawn as two different things — a fixed amber
// bar on the header band, and an inline tinted strip above the score cards —
// which made tapping Edit look like the screen had changed into something
// else. Same bar for both, so what changes when you tap Edit is what it SAYS.
//
// It rides ON the app header for the reason the other bars here do: the header
// is a logo and a caption, so nothing under it is worth tapping, while the
// hole strip below it is exactly what a scorer reaches for while this is up.
// It stops 88px short of the right edge to leave the director's group switcher
// — the one live control on that band — uncovered.
const HoleStateBar = ({ glyph, label, children }) => (
  <div style={{
    position: "fixed", top: `calc(${HEADER_SAFE_PAD} + 6px)`, left: 12, right: 88,
    display: "flex", alignItems: "center", gap: 8,
    background: K.warn + ALPHA.tint, backdropFilter: "blur(8px)",
    border: `1.5px solid ${K.warn}`, borderRadius: R.lg, padding: "8px 12px",
    zIndex: 1000, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", animation: "toastDownBar 0.3s ease",
  }}>
    <span style={{
      flexShrink: 0, width: 18, height: 18, borderRadius: "50%", background: K.warn, color: ON_ACC,
      fontSize: FS.micro, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
    }}>{glyph}</span>
    <span style={{ flex: 1, fontSize: FS.small, fontWeight: 800, color: K.warn, lineHeight: 1.2 }}>{label}</span>
    {children}
  </div>
);
// The bar's two actions. Filled either way: the button that resolves this
// state should never be the quietest thing on the bar it belongs to.
const holeBarBtn = (fill) => ({
  padding: "7px 10px", borderRadius: R.sm, background: fill, border: "none",
  color: ON_ACC, fontSize: FS.label, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
});

function OnCourseScoring({ user, players, round, tRounds, courses, holeData, tPlayers, onSaveHole, notify, pairingsData, teeTimesData, roundDates, scoringOpen, setTee, getPlayerTee, finalizedRounds, scorecardSigs, onSignScorecard, onAttestScorecard, onUnsignScorecard, onFinalizeRound, onUnfinalizeRound, onGoToAdminCourses, markPlayerWD, ctpData, onSetCtp, onConfirmCtp, directorPick, onGroupChange, onSetRound }) {
  const [group, setGroup] = useState(null);
  const [currentHole, setCurrentHole] = useState(0);
  const [manualOverride, setManualOverride] = useState(false);
  const [showTeePicker, setShowTeePicker] = useState(null);
  const [editingCompleted, setEditingCompleted] = useState(false);
  const [navSource, setNavSource] = useState("auto");
  const navSourceRef = useRef("auto");
  const setNavSourceSynced = (v) => { navSourceRef.current = v; setNavSource(v); };
  const [holeTransition, setHoleTransition] = useState("idle");
  const [transitionDir, setTransitionDir] = useState(1); // 1 = forward (→), -1 = backward (←)
  const [showFinalize, setShowFinalize] = useState(false);
  const [wdConfirm, setWdConfirm] = useState(null);
  const [showFullCard, setShowFullCard] = useState(false);
  // CTP inline prompt (par-3s only). showCtpForHole is the 0-indexed hole being asked.
  // promptedCtpKeys is a SESSION guard keyed by `${round}_${holeNum}_${groupKey}` — it
  // must include the group, because one device may score several groups (director doing
  // mock entry, or a scorer covering a second foursome). Keying on round+hole alone was
  // the bug: the first group to answer consumed the key and every later group was
  // silently skipped. A standing tag from an earlier group NO LONGER suppresses the
  // prompt — it's surfaced as the "current CTP" number to beat.
  const [showCtpForHole, setShowCtpForHole] = useState(null);
  const promptedCtpKeys = useRef({});
  const [ctpPickPlayer, setCtpPickPlayer] = useState("");
  // NULL until the group sets one. A seeded default is a number nobody chose,
  // and it would ride onto the card as though somebody had paced it off — so
  // the wheel starts unanswered and Tag stays dead until it is answered.
  const [ctpFeet, setCtpFeet] = useState(null);
  // Where the wheel PARKS before anything is chosen — the standing tag, or a
  // sensible 10 — kept apart from ctpFeet so parking somewhere is not the
  // same as choosing it.
  const [ctpFeetStart, setCtpFeetStart] = useState(10);
  // The wheel scrolls itself into position on mount, and that fires the same
  // scroll event a thumb does. This flips only on a real gesture, so the
  // programmatic scroll cannot mark the distance as chosen.
  const ctpWheelTouched = useRef(false);
  // Front 9 check — shown once per group per round as they arrive on hole 10.
  // Same session-guard shape as the CTP prompt, and for the same reason: one
  // device can score more than one group, so the key carries the group.
  const [showFront9, setShowFront9] = useState(false);
  const promptedFront9Keys = useRef({});

  // ── The safety catch on a round that is not being played ──
  // The group key editing has been ARMED for, or null. A director who opened
  // Round 1 to LOOK at a card gets a read-only screen: the score buttons are a
  // grid of large targets, so arriving somewhere is one brushed thumb from
  // changing it. Arming takes a confirmation that names the change, and it is
  // per GROUP — walking to another group, or back to the live round, drops it.
  const [armedKey, setArmedKey] = useState(null);
  const { confirm: confirmEdit, confirmModal: editConfirmModal } = useConfirm();

  const tr = tRounds.find(t => t.round_number === round);
  const course = tr ? courses.find(c => c.id === tr.course_id) : null;

  // Check if director pre-set pairings for this round
  const presetGroups = (pairingsData || {})[round] || [];
  const myPresetGroup = presetGroups.find(g => g.includes(user.id));

  // Auto-assign group from pairings if available and not manually overridden
  useEffect(() => {
    // Always reset editing state when round changes
    setEditingCompleted(false);
    // A manual pick only survives while the group it named is still IN this
    // round's draw. It used to survive the round change outright, which is how
    // a director who picked Group 3 in Round 1 kept looking at Round 1's four
    // players after finalizing advanced the app to Round 2 — under Round 2's
    // heading, writing Round 2 scores for a group that isn't playing in it.
    if (manualOverride && presetGroups.some(g => sameGroup(g, group))) return;
    if (manualOverride) setManualOverride(false);
    if (myPresetGroup) {
      // Update group if pairings were set/changed (even if group already exists)
      if (!sameGroup(myPresetGroup, group)) {
        setGroup(myPresetGroup);
        setCurrentHole(0);
      }
    } else {
      // No pairings for this round — clear any stale group from a previous round
      setGroup(null);
      setCurrentHole(0);
    }
  }, [round, JSON.stringify(myPresetGroup)]);

  // ── The director's crown, landing ──
  // A pick made in the app header (components/GroupSwitcher) arrives as
  // { seq, round, ids }; the round has already been set on the app, in the same
  // batch, so by the time this runs `round` is the picked one. `seq` is what
  // makes it a one-shot: the pick stays in state after it lands, and without a
  // consumed marker any later return to that round would silently re-apply it.
  //
  // This effect MUST stay below the auto-assign one above. Both run in the
  // same commit when a pick crosses rounds — that one drops the group it no
  // longer recognises, this one puts the picked group in its place — and React
  // runs a component's effects in the order they are declared.
  const appliedPickRef = useRef(0);
  useEffect(() => {
    if (!directorPick || directorPick.seq === appliedPickRef.current) return;
    if (directorPick.round !== round) return;
    appliedPickRef.current = directorPick.seq;
    setGroup(directorPick.ids);
    setManualOverride(true);
  }, [directorPick, round]);

  // What the crown is pointed at, reported up so the chip can name it. The
  // header is two components above this one and has no idea a round is being
  // scored; which group this screen resolved to is the one fact it needs.
  const reportedGroup = group ? groupKeyOf(round, group) : null;
  useEffect(() => {
    if (onGroupChange) onGroupChange(group ? { round, ids: group } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportedGroup]);

  // ── Resume at the right hole when the group is set ──
  //
  // Which hole is decided by lib/holeAdvance's openingHole (pure, tested).
  // What is decided HERE is when to trust the answer, and that is the fix for
  // a real cold-load bug:
  //
  //   Pairings and hole scores arrive over separate Firestore subscriptions
  //   with no ordering guarantee. This effect used to be keyed on [group]
  //   alone, so when the pairings landed first it ran against an empty score
  //   map, decided hole 1, and never ran again — a player rejoining a round
  //   mid-way opened on hole 1 and had to walk forward by hand.
  //
  // `positionedForRef` records the group we have positioned for using REAL
  // data. An unresolved answer (nothing posted yet) does not claim the group,
  // so the effect stays armed and re-runs when the scores arrive. That also
  // makes it idempotent: once positioned, later score changes don't yank the
  // screen away from the hole the user is on.
  const positionedForRef = useRef(null);
  const positionKey = group ? `${round}:${group.slice().sort().join(",")}` : null;
  // Cheap signal that the group's scores changed, so the effect can re-run
  // while unresolved without depending on the whole holeData map.
  const groupScoreSig = group
    ? group.map(id => Object.keys(holeData[`${id}_${round}`] || {}).length).join(",")
    : "";

  useEffect(() => {
    if (!group || !course) return;
    if (positionedForRef.current === positionKey) return;

    const pids = group.map(id => players.find(p => p.id === id)?.id).filter(Boolean);
    const readScore = (pid, h) => (holeData[`${pid}_${round}`] || {})[h] || 0;
    const { hole, allComplete, resolved } = openingHole(pids, readScore);

    if (!resolved) {
      // Nothing posted. That is either a genuinely fresh card or a card whose
      // scores have not loaded, and they are indistinguishable from here — so
      // show hole 1 but leave the group unclaimed, and correct it if scores
      // turn up.
      setCurrentHole(0);
      setNavSourceSynced("auto");
      setEditingCompleted(false);
      return;
    }

    positionedForRef.current = positionKey;
    setCurrentHole(hole);
    // Auto on a live edge so scoring advances; manual on a finished card so
    // edit mode shows instead.
    setNavSourceSynced(allComplete ? "manual" : "auto");
    // Clear edit mode when landing on a live edge. Without this, switching
    // FROM a completed group INTO a fresh one left the flag stuck true — and
    // edit mode suppresses both the CTP prompt and auto-advance. Second path
    // to the "later groups get no CTP popup" bug.
    setEditingCompleted(allComplete);
  }, [positionKey, groupScoreSig, course]);

  // Note: round changes from other tabs should NOT reset scoring state
  // since the scoring component stays mounted. The group persists.

  const holePars = course ? (course.hole_pars || []) : [];
  const holeHcps = course ? (course.hole_handicaps || []) : [];
  const groupPlayers = group ? group.map(id => players.find(p => p.id === id)).filter(Boolean) : [];
  const par = holePars[currentHole] || 4;
  const hcp = holeHcps[currentHole] || (currentHole + 1);

  const getScore = (pid) => {
    const key = `${pid}_${round}`;
    return (holeData[key] || {})[currentHole] || 0;
  };

  const allScored = group ? groupPlayers.every(p => getScore(p.id) > 0) : false;

  // Group-finalized state. HOISTED here (originally declared ~200 lines below,
  // just above the render's early returns). The effects further down close over
  // isGroupFinalized; on a cold reopen this component mounts with course/group
  // still null and the render takes an early `return` BEFORE the old declaration
  // ran — leaving isGroupFinalized in the temporal dead zone. React then fires
  // the already-registered passive effect, which touches it and throws
  // "Cannot access ... before initialization", unmounting the whole app to a
  // dark screen (the reopen "flash then dark" bug). Declaring it up here — before
  // any effect or early return — guarantees it's always initialized when those
  // closures run. Depends only on group/round/finalizedRounds, all available now.
  const _groupKey = group ? groupKeyOf(round, group) : null;
  const isGroupFinalized = _groupKey && (finalizedRounds[_groupKey] || finalizedRounds[round]);

  // ── Off the round being played ──
  // Only a director can be here: the round pills are gone on this tab, and the
  // crown is the only control that moves the app off the round the tournament
  // is on. Everybody else is on the live round by construction, and nothing
  // below this line renders for them.
  //
  // A null live round — every round finalized, the event over — counts as off
  // for anything a director opens. There is no round to be ON, and that is the
  // state where a stray edit is least likely to be noticed.
  const liveRoundNum = liveRound(finalizedRounds, NUM_ROUNDS);
  const offRound = !!user.isDirector && liveRoundNum !== round;
  // Read-only until armed. Compared against the group ACTUALLY on screen rather
  // than the one that was armed, so a selection that resolves elsewhere — the
  // pairings redrawn under the director's feet — lands read-only rather than
  // carrying an arming granted for something else.
  const editLocked = offRound && armedKey !== _groupKey;
  useEffect(() => {
    setArmedKey(k => (k != null && k !== _groupKey ? null : k));
  }, [_groupKey]);

  const isHoleComplete = (holeIdx) => {
    if (!group) return false;
    return groupPlayers.every(p => {
      const key = `${p.id}_${round}`;
      return (holeData[key] || {})[holeIdx] > 0;
    });
  };

  const findNextIncompleteHole = () => {
    for (let i = 0; i < 18; i++) {
      if (!isHoleComplete(i)) return i;
    }
    return 17; // all complete
  };

  const goToHole = (holeIdx) => {
    if (holeIdx === currentHole) return;
    const dir = holeIdx > currentHole ? 1 : -1;
    setTransitionDir(dir);
    setHoleTransition("out");
    setTimeout(() => {
      setNavSourceSynced("manual");
      setEditingCompleted(false);
      setCurrentHole(holeIdx);
      setHoleTransition("in-start"); // instant: new content placed off-screen right
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setHoleTransition("in-end"); // animated: slides in from right to center
        setTimeout(() => setHoleTransition("idle"), 250);
      }));
    }, 180);
  };

  const returnToPlay = () => {
    const next = findNextIncompleteHole();
    setNavSourceSynced("auto");
    setEditingCompleted(false);
    setCurrentHole(next);
  };

  // All 18 holes complete for the group
  const allRoundComplete = group ? (() => {
    const gPlayers = group.map(id => players.find(p => p.id === id)).filter(Boolean);
    return gPlayers.every(p => {
      for (let h = 0; h < 18; h++) { if (!((holeData[`${p.id}_${round}`] || {})[h] > 0)) return false; }
      return true;
    });
  })() : false;

  // When all 18 complete and not finalized, auto-show finalize prompt (only once)
  const shownFinalizeRef = useRef(false);
  useEffect(() => {
    if (!group) return;
    const groupKey = `${round}_${group.slice().sort().join(",")}`;
    const isFinalized = finalizedRounds[groupKey] || finalizedRounds[round];
    const isSignedNow = !!(scorecardSigs || {})[groupKey];
    if (allRoundComplete && !isFinalized && !isSignedNow && !shownFinalizeRef.current) {
      shownFinalizeRef.current = true;
      setCurrentHole(17);
      setNavSourceSynced("manual");
      setTimeout(() => setShowFinalize(true), 400);
    }
    if (!allRoundComplete) shownFinalizeRef.current = false;
  }, [allRoundComplete, JSON.stringify(group), round]);

  // Prompt for CTP when a par-3 completes for THIS group. Blocks the auto-advance
  // below until the group tags a winner or passes. Only prompts during fresh scoring —
  // not while editing an already-completed hole — since the Betting tab is the right
  // place for a director to correct a stale tag.
  //
  // CTP is tournament-wide (one winner per par-3 per round), so an existing tag from an
  // earlier group must NOT suppress this: every group gets asked, sees the standing
  // distance, and either beats it or passes. The only suppression is the per-group
  // session guard, so a group isn't re-nagged when it revisits its own hole.
  useEffect(() => {
    if (!group || isGroupFinalized) return;
    if (editingCompleted) return;
    if (par !== 3) return;
    if (!allScored) return;
    const holeNum = currentHole + 1;
    const key = `${round}_${holeNum}_${group.slice().sort().join(",")}`;
    if (promptedCtpKeys.current[key]) return;
    if (showCtpForHole === currentHole) return;
    promptedCtpKeys.current[key] = true;
    const leader = ((ctpData || {})[round] || {})[holeNum];
    // Seed the wheel at the standing distance so "beat it" means scrolling up, not
    // hunting from a cold 10 ft default.
    setCtpPickPlayer("");
    setCtpFeet(null);
    ctpWheelTouched.current = false;
    setCtpFeetStart(leader?.distanceFt ? Math.max(1, Math.min(CTP_MAX_FT, leader.distanceFt)) : 10);
    setShowCtpForHole(currentHole);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allScored, par, currentHole, round, ctpData, editingCompleted, isGroupFinalized]);

  // Front 9 check — the turn is where a wrong number is still cheap to fix.
  // Once the group lands on hole 10 with all nine front holes in, the group's
  // gross front nine goes up as a card to eyeball before they play on. Once
  // per group per round: a group walking back to hole 4 and forward again is
  // not asking to be shown it twice. A par-3 ninth fires the CTP prompt first,
  // so this waits for that to close rather than stacking on top of it.
  useEffect(() => {
    if (!group || isGroupFinalized) return;
    if ((scorecardSigs || {})[_groupKey]) return;
    if (editingCompleted) return;
    if (currentHole !== 9) return;
    if (showCtpForHole !== null) return;
    const frontDone = nineComplete(
      groupPlayers.map(p => p.id),
      (pid, h) => (holeData[`${pid}_${round}`] || {})[h],
    );
    if (!frontDone) return;
    const key = `${round}_${group.slice().sort().join(",")}`;
    if (promptedFront9Keys.current[key]) return;
    promptedFront9Keys.current[key] = true;
    setShowFront9(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHole, group, round, holeData, editingCompleted, isGroupFinalized, showCtpForHole]);

  // Auto-advance after short delay when all scored (only on fresh scoring, not editing).
  // Suppressed while the CTP popup is open so the user isn't fighting the animation.
  useEffect(() => {
    if (showCtpForHole === currentHole) return;
    if (allScored && currentHole < 17 && navSourceRef.current === "auto" && !editingCompleted && !allRoundComplete) {
      const timer = setTimeout(() => {
        setTransitionDir(1);
        setHoleTransition("out");
        const advance = setTimeout(() => {
          setCurrentHole(h => {
            // Skip over any already-completed holes when auto-advancing
            let next = h + 1;
            while (next < 17 && groupPlayers.every(p => (holeData[`${p.id}_${round}`] || {})[next] > 0)) {
              next++;
            }
            return next;
          });
          setNavSourceSynced("auto");
          setHoleTransition("in-start");
          requestAnimationFrame(() => requestAnimationFrame(() => {
            setHoleTransition("in-end");
            setTimeout(() => setHoleTransition("idle"), 250);
          }));
        }, 180);
        return () => clearTimeout(advance);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [allScored, currentHole, editingCompleted, showCtpForHole]);

  const getCH = (p) => {
    if (!course) return 0;
    const tp = tPlayers.find(t => t.player_id === p.id);
    const hi = parseFloat(tp?.handicap_index) || 0;
    const tee = getPlayerTee(round, p.id, course);
    return calcCH(hi, tee?.slope || course.slope, tee?.rating || course.rating, tee?.par || course.par);
  };

  const getTeeName = (p) => {
    const tee = getPlayerTee(round, p.id, course);
    return tee?.name || "Default";
  };

  // Calculate strokes per hole - handles CH > 18 (wraps around)
  const getStrokesMap = (ch) => {
    const map = {};
    const sorted = holeHcps.map((h, i) => ({ idx: i, hcp: h })).sort((a, b) => a.hcp - b.hcp);
    let rem = Math.abs(ch);
    // First pass: 1 stroke each, easiest-to-hardest by handicap index
    for (const h of sorted) { if (rem <= 0) break; map[h.idx] = (map[h.idx] || 0) + 1; rem--; }
    // Second pass: if CH > 18, wrap around for 2nd strokes
    for (const h of sorted) { if (rem <= 0) break; map[h.idx] = (map[h.idx] || 0) + 1; rem--; }
    // Third pass: if CH > 36 (unlikely but safe)
    for (const h of sorted) { if (rem <= 0) break; map[h.idx] = (map[h.idx] || 0) + 1; rem--; }
    return map;
  };

  const getStrokes = (p, holeIdx) => {
    const ch = getCH(p);
    const map = getStrokesMap(ch);
    return map[holeIdx] || 0;
  };

  const getRunning = (pid) => {
    const key = `${pid}_${round}`;
    const scores = holeData[key] || {};
    let gross = 0, netToPar = 0, thru = 0;
    if (!course) return { gross, netToPar, thru };
    const tp = tPlayers.find(t => t.player_id === pid);
    const hi = parseFloat(tp?.handicap_index) || 0;
    const tee = getPlayerTee(round, pid, course);
    const ch = calcCH(hi, tee?.slope || course.slope, tee?.rating || course.rating, tee?.par || course.par);
    const strokeMap = getStrokesMap(ch);
    for (let h = 0; h < 18; h++) {
      if (scores[h]) {
        gross += scores[h];
        const p = holePars[h] || 4;
        const stroke = strokeMap[h] || 0;
        netToPar += (scores[h] - stroke - p);
        thru++;
      }
    }
    return { gross, netToPar, thru };
  };

  // ── The off-round banner ────────────────────────────────────────────
  // components/OffRoundBanner carries the look and the two hit targets; what
  // stays here is what they DO, since both act on this screen's own state.
  //
  // The confirm modal rides along with it. Every question this screen can ask
  // about an off-round edit is asked from inside this branch, so the two are
  // never apart — and the banner renders on each of the branches below that can
  // raise one.
  const offRoundBanner = offRound ? (
    <>
      <OffRoundBanner
        round={round} live={liveRoundNum} editLocked={editLocked}
        onReturn={onSetRound ? () => onSetRound(liveRoundNum) : null}
        onToggleEdit={async () => {
          if (!editLocked) { setArmedKey(null); return; }
          const ok = await confirmEdit({
            eyebrow: `Round ${round}`,
            title: "Edit scores in a round that isn't live?",
            message: [
              "This is not the round being played. Anything you change posts immediately and moves the leaderboard, and the players in this group are not asked.",
              "",
              "Editing stays on for this group until you tap Done or leave it.",
            ].join("\n"),
            confirmLabel: "Edit scores",
            destructive: true,
          });
          if (ok) setArmedKey(_groupKey);
        }}
      />
      <ConfirmModal modal={editConfirmModal} />
    </>
  ) : null;

  // What a score tap asks on a round that isn't live, and the tap itself. The
  // first tap does not enter a score, it asks — and it asks about THAT tap by
  // name: who, which hole, what it says now and what it would say. "Are you
  // sure?" is a question a thumb answers yes to without reading, and the tap
  // nobody meant to make is the whole point here.
  //
  // Saying yes applies the tap AND arms the group, so correcting a card is one
  // question rather than eighteen; the banner turns loud for as long as it
  // stays armed, and walking away from the group drops it.
  const saveScore = async (p, val) => {
    if (editLocked) {
      const was = getScore(p.id);
      const ok = await confirmEdit({
        eyebrow: `Round ${round} · Hole ${currentHole + 1}`,
        title: "Change a score in a round that isn't live?",
        message: [
          `${p.name}, hole ${currentHole + 1}: ${was > 0 ? was : "no score"} → ${val > 0 ? val : "no score"}.`,
          "",
          "This is not the round being played. The change posts immediately and moves the leaderboard, and the players in this group are not asked.",
          "",
          "Editing stays on for this group until you leave it.",
        ].join("\n"),
        confirmLabel: "Change it",
        destructive: true,
      });
      if (!ok) return;
      setArmedKey(_groupKey);
    }
    onSaveHole(p.id, round, currentHole, val);
  };

  // ── EARLY RETURNS (after all hooks) ──
  if (!course) return (
    <div>
      {offRoundBanner}
      <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: FS.title, margin: "0 0 14px", fontWeight: 800 }}>Score — Round {round}</h2>
      <div
        onClick={user.isDirector && onGoToAdminCourses ? () => onGoToAdminCourses(round) : undefined}
        style={{ background: K.card, borderRadius: R.xl, border: `1px dashed ${K.warn}${ALPHA.hair}`, padding: 32, textAlign: "center", cursor: user.isDirector ? "pointer" : "default" }}
      >
        <div style={{ fontSize: FS.display, marginBottom: 8 }}>🏌️</div>
        <p style={{ color: K.warn, fontWeight: 600, margin: "0 0 4px" }}>No course set for Round {round}</p>
        {user.isDirector
          ? <p style={{ color: K.acc, fontSize: FS.small, margin: "0 0 0", fontWeight: 600 }}>Tap to set up course in Admin →</p>
          : <p style={{ color: K.t2, fontSize: FS.small, margin: 0 }}>Waiting on your tournament director.</p>
        }
      </div>
    </div>
  );

  if (!group) {
    if (myPresetGroup && !manualOverride) {
      setGroup(myPresetGroup);
      return null;
    }
    // Directors can pick any group to score
    if (user.isDirector && presetGroups.length > 0) {
      return (
        <div style={{ padding: "16px 0" }}>
          {offRoundBanner}
          <div style={{ fontSize: FS.small, fontWeight: 700, color: K.t2, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Select Group to Score</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {presetGroups.map((grp, gi) => {
              const grpPlayers = grp.map(id => players.find(p => p.id === id)).filter(Boolean);
              const grpKey = `${round}_${grp.slice().sort().join(",")}`;
              const isFinalized = finalizedRounds[grpKey] || finalizedRounds[round];
              const holesScored = Math.max(...grpPlayers.map(p => {
                const s = holeData[`${p.id}_${round}`] || {};
                return Object.values(s).filter(v => v > 0).length;
              }), 0);
              const allComplete = grpPlayers.every(p => { for (let h = 0; h < 18; h++) { if (!((holeData[`${p.id}_${round}`] || {})[h] > 0)) return false; } return true; });
              return (
                <div key={gi} style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                  <button onClick={() => { setGroup(grp); setManualOverride(true); }} style={{
                    flex: 1, background: K.card, border: `1px solid ${K.bdr}`, borderRadius: R.lg,
                    padding: "12px 16px", cursor: "pointer", textAlign: "left",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <div>
                      <div style={{ fontSize: FS.label, fontWeight: 700, color: K.acc, marginBottom: 4 }}>Group {gi + 1}</div>
                      <div style={{ fontSize: FS.small, fontWeight: 600, color: K.t1 }}>{grpPlayers.map(p => p.name.split(" ")[0]).join(", ")}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {isFinalized
                        ? <span style={{ fontSize: FS.label, fontWeight: 700, color: K.acc, background: K.accGlow, padding: "3px 8px", borderRadius: R.sm }}>✓ Final</span>
                        : allComplete
                          ? <span style={{ fontSize: FS.label, fontWeight: 700, color: K.warn, background: K.warn + ALPHA.wash, padding: "3px 8px", borderRadius: R.sm }}>18 ✓ Ready</span>
                          : holesScored > 0
                            ? <span style={{ fontSize: FS.label, fontWeight: 600, color: K.warn }}>Thru {holesScored}</span>
                            : <span style={{ fontSize: FS.label, color: K.t3 }}>Not started</span>
                      }
                    </div>
                  </button>
                  {allComplete && !isFinalized && (
                    <button onClick={() => { onFinalizeRound(grpKey); notify("Group finalized! ✓"); }} style={{
                      padding: "0 16px", borderRadius: R.lg, background: K.acc, border: "none",
                      color: K.bg, fontSize: FS.label, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
                    }}>✓ Finalize</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    // No draw for this round. For a player that is a wait; for a director it
    // is a job, and the job is two taps away, so say which it is.
    return (
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        {offRoundBanner}
        <div style={{ fontSize: FS.jumbo, marginBottom: 12 }}>⛳</div>
        <div style={{ fontSize: FS.lead, fontWeight: 700, color: K.t1, marginBottom: 6 }}>
          {user.isDirector ? `No pairings for Round ${round}` : "Waiting for Pairings"}
        </div>
        <div style={{ fontSize: FS.small, color: K.t3, marginBottom: user.isDirector ? 16 : 0 }}>
          {user.isDirector
            ? "Nobody can score this round until the groups are drawn."
            : "Your tournament director will set up groups before the round begins."}
        </div>
        {user.isDirector && onGoToAdminCourses && (
          <button onClick={() => onGoToAdminCourses(round)} style={{
            padding: "10px 20px", borderRadius: R.md, background: K.acc, border: "none",
            color: K.bg, fontSize: FS.small, fontWeight: 800, cursor: "pointer",
          }}>Set up Round {round} →</button>
        )}
      </div>
    );
  }

  // ── FINALIZED EARLY RETURN ──
  // (_groupKey / isGroupFinalized are hoisted to the top of the component so the
  // effects above can safely close over them — see the note there.)
  if (isGroupFinalized) return (
    <div style={{ padding: "24px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
      {offRoundBanner}
      {/* Submitted notice */}
      <div style={{ background: K.acc + ALPHA.wash, border: `1px solid ${K.acc}${ALPHA.hair}`, borderRadius: R.xl, padding: "24px 20px", textAlign: "center" }}>
        <div style={{ fontSize: FS.display, marginBottom: 12 }}>🏆</div>
        <div style={{ fontSize: FS.body, fontWeight: 800, color: K.acc, marginBottom: 6 }}>Scorecard Final</div>
        <div style={{ fontSize: FS.small, color: K.t3, lineHeight: 1.6, marginBottom: user.isDirector ? 16 : 0 }}>
          This group's round is signed, attested, and locked.
        </div>
        {user.isDirector && (
          <button onClick={() => { onUnfinalizeRound(_groupKey); notify("Round unfinalized — scores unlocked"); }} style={{
            marginTop: 4, padding: "10px 20px", borderRadius: R.md,
            background: "transparent", border: `1px solid ${K.bdr}`,
            color: K.t3, fontSize: FS.small, fontWeight: 600, cursor: "pointer",
          }}>↩ Unfinalize to Edit Scores</button>
        )}
      </div>
    </div>
  );

  // ── DRAW GUARD ──
  // The screen is about to put a score row up for every player in `group`. If
  // that group is not a foursome out of this round's draw — the whole field in
  // one group, a player drawn twice, somebody who is no longer on the roster —
  // then every row below is a card being built against the wrong people, and
  // it saves as it goes. Scoring stops here and says so instead.
  //
  // Placed after the finalized early-return: a signed and locked card keeps
  // showing as final, because nothing about it is going to change.
  const _nameOf = (pid) => players.find(p => p.id === pid)?.name || "a player no longer on the roster";
  const _troubleWithGroup = groupTrouble(group, {
    rosterIds: players.map(p => p.id),
    otherGroups: presetGroups.filter(g => !sameGroup(g, group)),
  });
  if (blocksScoring(_troubleWithGroup)) {
    const nameOf = _nameOf;
    return (
      <div style={{ padding: "24px 4px" }}>
        {offRoundBanner}
        <div style={{ background: K.warn + ALPHA.wash, border: `1px solid ${K.warn}${ALPHA.line}`, borderRadius: R.xl, padding: "22px 20px", textAlign: "center" }}>
          <div style={{ fontSize: FS.display, marginBottom: 10 }}>⚠️</div>
          <div style={{ fontSize: FS.body, fontWeight: 800, color: K.warn, marginBottom: 8 }}>Round {round} pairings need a fix</div>
          <div style={{ fontSize: FS.small, color: K.t2, lineHeight: 1.6, maxWidth: 320, margin: "0 auto" }}>
            {describeTrouble(_troubleWithGroup, nameOf)}
          </div>
          <div style={{ fontSize: FS.small, color: K.t3, lineHeight: 1.6, maxWidth: 320, margin: "10px auto 0" }}>
            {user.isDirector
              ? "Scoring is held until the draw is right — a card entered against the wrong group is the expensive kind of mistake."
              : "Your tournament director has to redraw this round before scoring can open. Nothing you have already posted is lost."}
          </div>
          {user.isDirector && onGoToAdminCourses && (
            <button onClick={() => onGoToAdminCourses(round)} style={{
              marginTop: 16, padding: "10px 20px", borderRadius: R.md, background: K.acc, border: "none",
              color: K.bg, fontSize: FS.small, fontWeight: 800, cursor: "pointer",
            }}>Fix Round {round} pairings →</button>
          )}
        </div>
      </div>
    );
  }

  // ── SCORING GATE ──
  // Non-directors can't enter scores until SCORING_LEAD_MIN before their group's
  // tee time on the round's scheduled date — unless a director has toggled the
  // round's scoring open. Directors always bypass (isScoringOpen returns true).
  // Placed after the finalized early-return so a locked group still shows its
  // final screen rather than the gate.
  const _myGroupIdx = group ? presetGroups.findIndex(g => g.slice().sort().join(",") === group.slice().sort().join(",")) : -1;
  const _myTeeTime = _myGroupIdx >= 0 ? ((teeTimesData || {})[round] || [])[_myGroupIdx] : null;
  const _scoringGateOpen = isScoringOpen({ round, teeTime: _myTeeTime, roundDates, scoringOpen, isDirector: user.isDirector });
  if (!_scoringGateOpen) {
    const teeMin = teeTimeToMinutes(_myTeeTime);
    const opensAt = teeMin != null ? minutesToTimeStr(teeMin - SCORING_LEAD_MIN) : null;
    const dateStr = (roundDates || {})[round];
    return (
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: FS.jumbo, marginBottom: 12 }}>{_myTeeTime ? "⏱️" : "⚠️"}</div>
        <div style={{ fontSize: FS.lead, fontWeight: 700, color: K.t1, marginBottom: 6 }}>
          {_myTeeTime ? "Scoring Not Open Yet" : `Round ${round} has no tee times`}
        </div>
        {/* Without a tee time there is nothing for the gate to open on, so it
            stays shut — and "your director will open scoring" reads as a wait
            for something that is never going to happen on its own. Name the
            missing setting instead. */}
        <div style={{ fontSize: FS.small, color: K.t3, lineHeight: 1.7, maxWidth: 300, margin: "0 auto" }}>
          {_myTeeTime ? (
            <>
              Scoring for your group opens {SCORING_LEAD_MIN} minutes before your{" "}
              <strong style={{ color: K.t2 }}>{_myTeeTime}</strong> tee time
              {opensAt ? <> — at <strong style={{ color: K.acc }}>{opensAt}</strong></> : null}
              {dateStr ? <> on <strong style={{ color: K.t2 }}>{fmtRoundDate(dateStr)}</strong></> : null}.
            </>
          ) : (
            <>Scoring opens {SCORING_LEAD_MIN} minutes before your tee time, and this round has none set. Your tournament director needs to set them in Admin.</>
          )}
        </div>
        {_myGroupIdx >= 0 && (
          <div style={{ marginTop: 14, fontSize: FS.label, color: K.t3, opacity: 0.7 }}>Group {_myGroupIdx + 1}</div>
        )}
      </div>
    );
  }

  // ── SIGN / ATTESTATION STATE (two-phase scorecard, ported from league) ──
  // A signed-but-not-attested group renders in the main view (not the
  // finalized early-return). `finalizedRounds[groupKey]` still means FINAL
  // and triggers the early return above, so all existing lock checks stay
  // intact. `scorecardSigs[groupKey]` carries the in-between signed state.
  const groupKey = _groupKey;
  const isWDpid = (pid) => { const tp = tPlayers.find(t => t.player_id === pid); return tp?.status === "WD"; };
  const presentGroupPids = group ? group.filter(pid => !isWDpid(pid)) : [];
  const sig = groupKey ? (scorecardSigs || {})[groupKey] : null;
  const isSigned = !!sig;
  const signerPid = sig?.signedBy || null;
  const signerName = sig?.signedByName || null;
  const attestedPids = sig?.attestedBy || [];
  const presentNonSigners = presentGroupPids.filter(pid => pid !== signerPid);
  const allAttested = isSigned && presentNonSigners.every(pid => attestedPids.includes(pid));
  const meId = user?.id;

  // Walked back onto a hole this group has already finished. Drives the amber
  // bar on the header band, and suppresses the Round complete bar while it is
  // up — they share that band, and this one is the answer to what the player
  // just did. Signing is still one tap away in the footer.
  const onCompletedHole = !isSigned && navSource === "manual" && isHoleComplete(currentHole) && !editingCompleted;

  // ── What the DIRECTOR can't see from here ──
  // A director bypasses the scoring gate, so a round with no tee times looks
  // completely normal on this screen while every player in the field is stuck
  // on "Scoring Not Open Yet" — the one setup fault the person who can fix it
  // is structurally blind to. Same for another group's draw being broken:
  // this screen is one group, and the round is not.
  // One slim line, director only, and only when there is something to fix.
  const _setup = user.isDirector
    ? roundTrouble({ groups: presetGroups, teeTimes: (teeTimesData || {})[round], rosterIds: players.map(p => p.id) })
    : { broken: [], missingTeeTimes: [] };
  const _setupWarning = !user.isDirector ? null : (() => {
    // A stale draw in THIS group first — it is the one the director is looking
    // at, and it did not stop the screen, so nothing else will say it.
    if (_troubleWithGroup) return describeTrouble(_troubleWithGroup, _nameOf);
    const miss = _setup.missingTeeTimes.length;
    if (miss > 0) {
      return miss === _setup.groupCount
        ? "No tee times set — nobody else can score this round"
        : `${miss} group${miss === 1 ? "" : "s"} with no tee time — they can't score`;
    }
    if (_setup.broken.length > 0) return `Group ${_setup.broken[0].index + 1}'s draw needs a fix`;
    return null;
  })();

  const handleSign = () => {
    if (!groupKey) return;
    tapBigAction();
    const sName = user?.name || "Scorer";
    const nonSigners = presentGroupPids.filter(pid => pid !== meId);
    onSignScorecard(groupKey, meId, sName, presentGroupPids, round);
    setShowFinalize(false);
    notify(nonSigners.length === 0 ? "Scorecard signed ✓" : "Scorecard signed — awaiting attestation");
  };
  const handleAttest = (pid) => {
    if (!groupKey || !sig) return;
    tapBigAction();
    onAttestScorecard(groupKey, pid, presentNonSigners);
  };
  const handleUnsign = () => {
    if (!groupKey) return;
    onUnsignScorecard(groupKey);
    notify("Scorecard unsigned — scores unlocked");
  };

  return (
    <div>
      {offRoundBanner}
      {/* No header row here. The round, the course and the way back to the
          other groups all used to ride above the hole strips; the crown in the
          app header (components/GroupSwitcher) names the group and the round it
          belongs to, and reaches every group in every round rather than only
          this round's draw — so the row was spending the top of the scoring
          screen on an answer already on screen and a control already in the
          chrome. The hole strips start at the top now. */}
      {/* The director's one line about the round they can't see from here.
          A whole row is a lot on this screen, so it is 24px tall, it only
          exists when something is actually wrong, and tapping it lands on the
          round's setup rather than making anybody go looking. */}
      {_setupWarning && onGoToAdminCourses && (
        <div onClick={() => onGoToAdminCourses(round)} style={{
          display: "flex", alignItems: "center", gap: 6, marginBottom: 8, cursor: "pointer",
          padding: "5px 10px", borderRadius: R.sm,
          background: K.warn + ALPHA.wash, border: `1px solid ${K.warn}${ALPHA.hair}`,
        }}>
          <span style={{ fontSize: FS.label }}>⚠️</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: FS.micro, fontWeight: 700, color: K.warn, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{_setupWarning}</span>
          <span style={{ fontSize: FS.micro, fontWeight: 800, color: K.t3, letterSpacing: 0.5, flexShrink: 0 }}>FIX →</span>
        </div>
      )}

      {/* Hole navigator - Front 9 / Back 9 */}
      <div style={{ marginBottom: 8 }}>
        {[0, 9].map(start => (
          // 6px of air between the tiles, and between the two rows. The
          // current hole is ringed with a 2px outline set 1px off the button,
          // so it reaches 3px past its own box on every side — at a 2px gap
          // the neighbouring tiles painted over it and the ring looked cut
          // off down its sides. 6px clears the ring; the raised tile also
          // stacks above its neighbours so nothing can cover it.
          <div key={start} style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 6 }}>
            {Array.from({ length: 9 }, (_, i) => start + i).map(i => {
              const allScoredHole = groupPlayers.every(p => (holeData[`${p.id}_${round}`] || {})[i] > 0);
              const isCurrent = i === currentHole;
              return (
                <button key={i} onClick={() => goToHole(i)} style={{
                  flex: 1, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                  position: "relative", zIndex: isCurrent ? 1 : 0,
                  borderRadius: allScoredHole || isCurrent ? R.lg : R.sm,
                  border: allScoredHole && !isCurrent ? `1.5px solid ${K.acc}${ALPHA.line}` : "none",
                  cursor: "pointer",
                  // A rung above the label size these tiles used to wear. They
                  // are 18 targets across a phone and the number in them is
                  // how you find the one you want; the 32px tile carries it
                  // without growing.
                  fontSize: FS.small, fontWeight: 700,
                  background: isCurrent ? K.acc : allScoredHole ? K.accDim + ALPHA.wash : K.card,
                  color: isCurrent ? K.bg : allScoredHole ? K.acc : K.t3,
                  outline: isCurrent ? `2px solid ${K.acc}` : "none",
                  outlineOffset: 1,
                  transition: `all ${MOTION}`,
                }}>{i + 1}</button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Full Scorecard — Bourbon Cup's placement: a full-width bar under the
          hole strips and above the hole banner, rather than a pill tucked into
          the header row. It is the one control on this screen that isn't about
          the hole you're standing on, and at pill size it read as a label. The
          bar costs one slim row and is reachable without scrolling past four
          player cards. */}
      <button onClick={() => setShowFullCard(true)} style={{
        width: "100%", padding: "9px 0", borderRadius: R.sm, marginBottom: 8, cursor: "pointer",
        // A card-coloured bar with a neutral edge sat flat against the hole
        // strips above it and read as a caption. It keeps its footprint — a
        // hint of the accent on the edge, full-strength ink, and a shadow to
        // lift it off the background is enough to read as something to tap.
        background: K.card, border: `1px solid ${K.acc}${ALPHA.hair}`, color: K.t1,
        boxShadow: `0 1px 2px ${SHADOW}`,
        fontFamily: FONT, fontSize: FS.small, fontWeight: 700, letterSpacing: 0.5,
      }}>Full Scorecard</button>

      {/* Animated hole content */}
      <div style={{
        transition: holeTransition === "in-start" ? "none" : "opacity 0.2s ease, transform 0.2s ease",
        opacity: holeTransition === "out" ? 0 : holeTransition === "in-start" ? 0 : 1,
        transform: holeTransition === "out"
          ? `translateX(${transitionDir * -60}px)`
          : holeTransition === "in-start"
            ? `translateX(${transitionDir * 60}px)`
            : "translateX(0)",
      }}>

      {/* Current hole header - compact with par left, hcp right */}
      <div style={{
        background: `linear-gradient(135deg, ${K.card}, ${K.hover})`,
        borderRadius: R.lg, border: `1px solid ${K.bdr}`, padding: "10px 16px",
        marginBottom: 8, position: "relative",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={() => goToHole(Math.max(0, currentHole - 1))} disabled={currentHole === 0}
            style={{ width: 34, height: 34, borderRadius: R.md, background: K.inp, border: `1px solid ${K.bdr}`, color: currentHole === 0 ? K.t3 + ALPHA.hair : K.t1, fontSize: FS.lead, cursor: "pointer", fontWeight: 700 }}>‹</button>
          <div style={{ fontSize: FS.label, color: K.t3, textAlign: "center" }}>
            <span style={{ fontWeight: 600 }}>Par</span>
            <div style={{ fontSize: FS.lead, fontWeight: 700, color: K.t3, lineHeight: 1, marginTop: 2 }}>{par}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: FS.label, color: K.t1, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>Hole</div>
            <div style={{ fontSize: FS.jumbo, fontWeight: 800, fontFamily: "'Montserrat', sans-serif", lineHeight: 1, color: K.t1 }}>{currentHole + 1}</div>
          </div>
          <div style={{ fontSize: FS.label, color: K.t3, textAlign: "center" }}>
            <span style={{ fontWeight: 600 }}>HCP</span>
            <div style={{ fontSize: FS.lead, fontWeight: 700, color: K.t3, lineHeight: 1, marginTop: 2 }}>{hcp}</div>
          </div>
          <button onClick={() => goToHole(Math.min(17, currentHole + 1))} disabled={currentHole === 17}
            style={{ width: 34, height: 34, borderRadius: R.md, background: K.inp, border: `1px solid ${K.bdr}`, color: currentHole === 17 ? K.t3 + ALPHA.hair : K.t1, fontSize: FS.lead, cursor: "pointer", fontWeight: 700 }}>›</button>
        </div>
      </div>

      {/* No CTP row rides above the players on a par 3. The prompt that fires
          once the hole is scored asks the question and shows the standing
          distance, so a second copy of it here only bought a row — and on a
          par 3 that row pushed the last player's score buttons down behind the
          tab bar. The prompt is the whole story. */}

      {/* Completed hole — the banner that used to sit here is now a bar on the
          header band (rendered outside the animated wrapper, below), so the
          read-only scores start where the score cards normally would. */}
      {onCompletedHole && (<>
        {/* Recorded scores - styled like scoring cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {groupPlayers.map(p => {
            const s = (holeData[`${p.id}_${round}`] || {})[currentHole] || 0;
            const ch = getCH(p);
            const strokes = getStrokes(p, currentHole);
            const maxBase = 8;
            const btnScores = [2,3,4,5,6,7,8];
            // Adjust range if score is outside normal buttons
            let displayScores = [...btnScores];
            if (s === 1) displayScores[0] = 1;
            if (s > maxBase) displayScores[displayScores.length - 1] = s;
            return (
              // Tapping a locked card IS the request to edit it — that tap was
              // already happening, it just landed on nothing.
              <div key={p.id} onClick={() => setEditingCompleted(true)} style={{
                background: K.card, borderRadius: R.md, border: `1px solid ${K.warn}${ALPHA.hair}`,
                padding: "8px 10px", opacity: 0.85, cursor: "pointer",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: FS.body, fontWeight: 700 }}>{p.name}</span>
                    <span style={{ fontSize: FS.label, color: K.acc, fontWeight: 700 }}>{ch}</span>
                    {strokes > 0 && <span style={{ color: K.acc, fontSize: FS.label, letterSpacing: "-1px" }}>{"●".repeat(strokes)}</span>}
                  </div>
                  <span style={{ fontSize: FS.micro, color: K.warn, fontWeight: 700, letterSpacing: "0.06em" }}>✏️ TAP TO EDIT</span>
                </div>
                <div style={{ display: "flex", gap: 3 }}>
                  {displayScores.map(btn => {
                    const isCur = btn === s;
                    const bsd = btn - par;
                    const bclr = bsd < 0 ? K.under : bsd === 0 ? K.t2 : K.eagle;
                    const sz = 32;
                    return (
                      <div key={btn} style={{
                        flex: 1, height: 38,
                        fontWeight: 800, fontSize: FS.body, textAlign: "center",
                        background: isCur ? K.t2 : K.t2 + ALPHA.wash,
                        color: isCur ? K.bg : K.t2,
                        borderRadius: R.sm, position: "relative",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {isCur && bsd !== 0 && (
                          <div style={{ position: "absolute", width: sz, height: sz, left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>
                            <div style={{ position: "absolute", inset: 0, borderRadius: bsd < 0 ? "50%" : R.xs, border: `1.5px solid ${bclr}` }} />
                            {(bsd <= -2 || bsd >= 2) && <div style={{ position: "absolute", inset: 3, borderRadius: bsd < 0 ? "50%" : R.xs, border: `1px solid ${bclr}` }} />}
                          </div>
                        )}
                        <span style={{ position: "relative", zIndex: 1 }}>{btn}</span>
                      </div>
                    );
                  })}
                  <div style={{ flex: "0 0 32px" }} />
                </div>
              </div>
            );
          })}
        </div>
      </>)}

      {/* Signed notice — score entry is locked once the card is signed (unsign to edit) */}
      {isSigned && (
        <div style={{ background: K.acc + ALPHA.wash, border: `1px solid ${K.acc}${ALPHA.hair}`, borderRadius: R.md, padding: "12px 14px", textAlign: "center", marginBottom: 8 }}>
          <div style={{ fontSize: FS.small, fontWeight: 800, color: K.acc, marginBottom: 2 }}>✍️ Scorecard Signed</div>
          <div style={{ fontSize: FS.label, color: K.t3 }}>Scores are locked while attestation is pending. Unsign below to edit.</div>
        </div>
      )}

      {/* Player score cards */}
      {!isSigned && !(navSource === "manual" && isHoleComplete(currentHole) && !editingCompleted) && (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 8 }}>
        {groupPlayers.map(p => {
          const score = getScore(p.id);
          const ch = getCH(p);
          const strokes = getStrokes(p, currentHole);
          const running = getRunning(p.id);

          return (
            <div key={p.id} style={{
              background: K.card, borderRadius: R.md, border: `1px solid ${K.bdr}`,
              padding: "8px 10px",
            }}>
              {/* Player header row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: FS.body, fontWeight: 700 }}>{p.name}</span>
                  <span style={{ fontSize: FS.label, color: K.acc, fontWeight: 700 }}>{ch}</span>
                  {strokes > 0 && <span style={{ color: K.acc, fontSize: FS.label, letterSpacing: "-1px" }}>{"●".repeat(strokes)}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {running.thru > 0 && <span style={{ fontSize: FS.label, color: K.t3 }}>Thru {running.thru}: <span style={{ color: running.netToPar < 0 ? K.under : running.netToPar > 0 ? K.t2 : K.t2, fontWeight: 700 }}>{fmtPar(running.netToPar)}</span></span>}
                  <button onClick={() => setWdConfirm(p.id)} title="Withdraw player" style={{ fontSize: FS.micro, fontWeight: 700, color: K.t3, background: "transparent", border: `1px solid ${K.bdr}`, borderRadius: R.sm, padding: "2px 7px", cursor: "pointer", letterSpacing: 0.5, flexShrink: 0 }}>WD</button>
                </div>
              </div>

              {/* Tee picker - expandable */}
              {showTeePicker === p.id && course.tee_boxes && course.tee_boxes.length > 0 && (
                <div style={{ display: "flex", gap: 3, marginBottom: 6, flexWrap: "wrap" }}>
                  {course.tee_boxes.map(tee => {
                    const isActive = getTeeName(p) === tee.name;
                    const tp2 = tPlayers.find(t => t.player_id === p.id);
                    const hi2 = parseFloat(tp2?.handicap_index) || 0;
                    const previewCH = calcCH(hi2, tee.slope, tee.rating, tee.par);
                    return (
                      <button key={tee.name} onClick={() => { setTee(round, p.id, tee.name); setShowTeePicker(null); }} style={{
                        flex: 1, minWidth: 55, padding: "6px 4px", borderRadius: R.sm, cursor: "pointer", textAlign: "center",
                        background: isActive ? tee.color  + ALPHA.tint : K.inp,
                        border: `1.5px solid ${isActive ? tee.color : K.bdr}`,
                        color: K.t1,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, marginBottom: 1 }}>
                          <TeeColorSwatch color={tee.color} name={tee.name} size={8} />
                          <span style={{ fontSize: FS.label, fontWeight: 700 }}>{tee.name}</span>
                        </div>
                        <div style={{ fontSize: FS.micro, color: K.acc, fontWeight: 700 }}>CH {previewCH}</div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Score buttons — par-relative control (ported from league) */}
              {/* saveScore, not onSaveHole: on a round that isn't live the first
                  tap asks before it writes. See the note on saveScore. */}
              <ScoreButtonRow score={score} par={par} onPick={(val) => saveScore(p, val)} />
            </div>
          );
        })}
      </div>
      )}

      </div>{/* end animated hole content */}

      {/* Footer — two-phase: Sign Scorecard → per-player Attest → FINAL */}
      <div style={{ marginTop: 8 }}>
        {isSigned ? (
          <div style={{ background: K.card, border: `1px solid ${K.acc}${ALPHA.hair}`, borderRadius: R.lg, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: FS.body }}>✍️</span>
              <span style={{ fontSize: FS.small, fontWeight: 800, color: K.acc }}>Scorecard Signed</span>
            </div>
            <div style={{ fontSize: FS.label, color: K.t3, lineHeight: 1.5, marginBottom: 10 }}>
              Signed by {signerName || "Scorer"}. {presentNonSigners.length === 0
                ? "No other players to attest — finalizing."
                : "Each player taps their name to attest their scores are correct."}
            </div>
            {presentNonSigners.length > 0 && (<>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {presentNonSigners.map(pid => {
                  const pl = players.find(pp => pp.id === pid);
                  const done = attestedPids.includes(pid);
                  return (
                    <button key={pid} disabled={done} onClick={() => handleAttest(pid)} style={{
                      fontSize: FS.small, fontWeight: 700, padding: "8px 12px", borderRadius: R.sm,
                      background: done ? K.acc + ALPHA.wash : K.inp,
                      border: `1.5px solid ${done ? K.acc + ALPHA.line : K.bdr}`,
                      color: done ? K.acc : K.t1, cursor: done ? "default" : "pointer",
                    }}>{done ? "✓ " : ""}{pl ? pl.name : pid}</button>
                  );
                })}
              </div>
              <div style={{ textAlign: "center", fontSize: FS.label, color: allAttested ? K.acc : K.warn, fontWeight: 700, marginBottom: 10 }}>
                {attestedPids.filter(pid => presentNonSigners.includes(pid)).length} of {presentNonSigners.length} attested{allAttested ? " — finalizing…" : ""}
              </div>
            </>)}
            <button onClick={handleUnsign} style={{
              width: "100%", padding: "8px 0", borderRadius: R.sm,
              background: "transparent", border: `1px solid ${K.bdr}`,
              color: K.t3, fontSize: FS.label, fontWeight: 600, cursor: "pointer",
            }}>↩ Unsign & edit scores</button>
          </div>
        ) : (() => {
          const hole18Done = groupPlayers.every(p => ((holeData[`${p.id}_${round}`] || {})[17] > 0));
          if (!hole18Done) return null;
          const allComplete = groupPlayers.every(p => { for (let h = 0; h < 18; h++) { if (!((holeData[`${p.id}_${round}`] || {})[h] > 0)) return false; } return true; });
          return (
            <Btn variant={allComplete ? "primary" : "secondary"} block onClick={() => setShowFinalize(true)}
              style={allComplete ? undefined : { background: K.card, color: K.t2 }}>✍️ Sign Scorecard</Btn>
          );
        })()}
      </div>

      {/* Full Scorecard popout — group, all 18 holes, stroke dots + birdie/bogey rings */}
      {showFullCard && (
        <Popup onClose={() => setShowFullCard(false)} maxWidth={460}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: FS.label, color: K.t3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{course ? course.name : ""} · Round {round}</div>
              </div>
              <button onClick={() => setShowFullCard(false)} style={{ flexShrink: 0, width: 30, height: 30, borderRadius: R.sm, border: `1px solid ${K.bdr}`, background: K.inp, color: K.t2, fontSize: FS.body, cursor: "pointer" }}>✕</button>
            </div>

            {[0, 9].map(start => {
              const holes = Array.from({ length: 9 }, (_, i) => start + i);
              const isFront = start === 0;
              const parTot = holes.reduce((a, h) => a + (holePars[h] || 0), 0);
              const par18 = holePars.slice(0, 18).reduce((a, p) => a + (p || 0), 0);
              const gridCols = isFront ? "54px repeat(9, minmax(0,1fr)) 30px" : "54px repeat(9, minmax(0,1fr)) 28px 32px";
              const cb = { display: "flex", alignItems: "center", justifyContent: "center", height: 32 };
              return (
                <div key={start} style={{ marginBottom: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 2 }}>
                    {/* HOLE */}
                    <div key="hl" style={{ ...cb, justifyContent: "flex-start", fontSize: FS.micro, fontWeight: 700, color: K.t3 }}>HOLE</div>
                    {holes.map(h => <div key={"h" + h} style={{ ...cb, fontSize: FS.label, fontWeight: 700, color: K.t3 }}>{h + 1}</div>)}
                    <div key="ho" style={{ ...cb, fontSize: FS.micro, fontWeight: 800, color: K.acc }}>{isFront ? "OUT" : "IN"}</div>
                    {!isFront && <div key="ht" style={{ ...cb, fontSize: FS.micro, fontWeight: 800, color: K.acc }}>TOT</div>}
                    {/* PAR */}
                    <div key="pl" style={{ ...cb, justifyContent: "flex-start", fontSize: FS.micro, fontWeight: 600, color: K.t3 }}>Par</div>
                    {holes.map(h => <div key={"p" + h} style={{ ...cb, fontSize: FS.label, fontWeight: 600, color: K.t2 }}>{holePars[h] || "-"}</div>)}
                    <div key="po" style={{ ...cb, fontSize: FS.label, fontWeight: 700, color: K.t2 }}>{parTot || "-"}</div>
                    {!isFront && <div key="pt" style={{ ...cb, fontSize: FS.label, fontWeight: 700, color: K.t2 }}>{par18 || "-"}</div>}
                    {/* SI */}
                    <div key="sl" style={{ ...cb, justifyContent: "flex-start", fontSize: FS.micro, fontWeight: 600, color: K.t3 }}>Handicap</div>
                    {holes.map(h => <div key={"s" + h} style={{ ...cb, fontSize: FS.micro, color: K.t3 }}>{holeHcps[h] || "-"}</div>)}
                    <div key="so" style={cb} />
                    {!isFront && <div key="st" style={cb} />}
                    {/* players */}
                    {groupPlayers.map(p => {
                      const scMap = holeData[`${p.id}_${round}`] || {};
                      const sum9 = holes.reduce((a, h) => { const v = scMap[h]; return a + ((v > 0 && v < 90) ? v : 0); }, 0);
                      const sum18 = Array.from({ length: 18 }, (_, h) => h).reduce((a, h) => { const v = scMap[h]; return a + ((v > 0 && v < 90) ? v : 0); }, 0);
                      const cells = [
                        <div key={p.id + "-n"} style={{ ...cb, justifyContent: "flex-start", overflow: "hidden" }}>
                          <span style={{ fontSize: FS.label, fontWeight: 700, color: K.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name.split(" ")[0]}</span>
                        </div>,
                        ...holes.map(h => {
                          const v = scMap[h];
                          const has = v > 0 && v < 90;
                          const wd = v >= 90;
                          const ph = holePars[h] || 4;
                          const sd = has ? v - ph : null;
                          const st = getStrokes(p, h);
                          const shaped = sd != null && sd !== 0;
                          const dbl = sd != null && (sd <= -2 || sd >= 2);
                          const clr = sd == null ? K.t3 : sd < 0 ? K.under : sd > 0 ? K.eagle : K.t1;
                          const radius = sd != null && sd < 0 ? "50%" : 4;
                          return (
                            <div key={p.id + "-" + h} style={{ ...cb, position: "relative", fontSize: FS.label, fontWeight: 700, color: K.t1 }}>
                              {shaped && <div style={{ position: "absolute", width: 20, height: 20, borderRadius: radius, border: `1.5px solid ${clr}`, left: "50%", top: "50%", transform: "translate(-50%,-50%)" }} />}
                              {dbl && <div style={{ position: "absolute", width: 24, height: 24, borderRadius: radius, border: `1px solid ${clr}`, left: "50%", top: "50%", transform: "translate(-50%,-50%)" }} />}
                              {st > 0 && <div style={{ position: "absolute", top: 1, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 2 }}>{Array.from({ length: Math.min(st, 2) }).map((_, di) => <div key={di} style={{ width: 3, height: 3, borderRadius: "50%", background: K.acc }} />)}</div>}
                              <span style={{ position: "relative", zIndex: 1 }}>{has ? v : (wd ? "—" : "")}</span>
                            </div>
                          );
                        }),
                        <div key={p.id + "-o"} style={{ ...cb, fontSize: FS.label, fontWeight: 800, color: K.t1 }}>{sum9 || ""}</div>,
                        ...(isFront ? [] : [<div key={p.id + "-t"} style={{ ...cb, fontSize: FS.label, fontWeight: 800, color: K.acc }}>{sum18 || ""}</div>]),
                      ];
                      return cells;
                    })}
                  </div>
                </div>
              );
            })}

            <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center", margin: "2px 0 10px", fontSize: FS.micro, color: K.t3 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 11, height: 11, borderRadius: "50%", border: "1.5px solid #ef4444", display: "inline-block" }} /> Birdie</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: R.xs, border: "1.5px solid #3b82f6", display: "inline-block" }} /> Bogey+</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 4, height: 4, borderRadius: "50%", background: K.acc, display: "inline-block" }} /> Stroke</span>
            </div>

            <button onClick={() => setShowFullCard(false)} style={{ display: "block", width: "100%", padding: 10, background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: R.md, color: K.t2, fontSize: FS.small, fontWeight: 700, cursor: "pointer" }}>Close</button>
        </Popup>
      )}

      {/* Front 9 check — the group's gross front nine, put up once as they
          reach hole 10. Gross only, and no stroke dots or birdie rings: this
          is the "is that what you shot?" card, not the scorecard, and the
          numbers a player can check against their own memory are the raw
          ones. Tapping a hole number closes this and walks back to that hole,
          because catching a wrong number is only useful with a way to it. */}
      {showFront9 && (() => {
        const holes = Array.from({ length: 9 }, (_, i) => i);
        const parOut = holes.reduce((a, h) => a + (holePars[h] || 0), 0);
        const cb = { display: "flex", alignItems: "center", justifyContent: "center", height: 30 };
        const gridCols = "58px repeat(9, minmax(0,1fr)) 34px";
        const jump = (h) => { setShowFront9(false); goToHole(h); };
        return (
          <Popup onClose={() => setShowFront9(false)} maxWidth={420} dismissOnBackdrop={false} background={K.card} borderColor={K.acc + ALPHA.hair} padding={0} zIndex={340}>
            <div style={{ background: K.acc + ALPHA.wash, borderBottom: `1px solid ${K.acc}${ALPHA.hair}`, padding: "14px 20px", textAlign: "center" }}>
              <div style={{ fontSize: FS.body, fontWeight: 800, color: K.acc, letterSpacing: 0.3 }}>At the Turn</div>
            </div>
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 2 }}>
                <div style={{ ...cb, justifyContent: "flex-start", fontSize: FS.micro, fontWeight: 700, color: K.t3 }}>HOLE</div>
                {holes.map(h => (
                  <button key={"h" + h} onClick={() => jump(h)} style={{ ...cb, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: FS.label, fontWeight: 700, color: K.acc }}>{h + 1}</button>
                ))}
                <div style={{ ...cb, fontSize: FS.micro, fontWeight: 800, color: K.acc }}>OUT</div>

                <div style={{ ...cb, justifyContent: "flex-start", fontSize: FS.micro, fontWeight: 600, color: K.t3 }}>Par</div>
                {holes.map(h => <div key={"p" + h} style={{ ...cb, fontSize: FS.label, fontWeight: 600, color: K.t2 }}>{holePars[h] || "-"}</div>)}
                <div style={{ ...cb, fontSize: FS.label, fontWeight: 700, color: K.t2 }}>{parOut || "-"}</div>

                {groupPlayers.map(p => {
                  const scMap = holeData[`${p.id}_${round}`] || {};
                  const out = holes.reduce((a, h) => { const v = scMap[h]; return a + ((v > 0 && v < 90) ? v : 0); }, 0);
                  return [
                    <div key={p.id + "-n"} style={{ ...cb, justifyContent: "flex-start", overflow: "hidden" }}>
                      <span style={{ fontSize: FS.label, fontWeight: 700, color: K.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name.split(" ")[0]}</span>
                    </div>,
                    ...holes.map(h => {
                      const v = scMap[h];
                      const has = v > 0 && v < 90;
                      return <div key={p.id + "-" + h} style={{ ...cb, fontSize: FS.label, fontWeight: 700, color: K.t1 }}>{has ? v : (v >= 90 ? "—" : "")}</div>;
                    }),
                    <div key={p.id + "-o"} style={{ ...cb, fontSize: FS.label, fontWeight: 800, color: K.acc }}>{out || ""}</div>,
                  ];
                })}
              </div>

              {/* The hole numbers above are still buttons back to that hole —
                  the line that said so is gone, but the way back is not. */}
              <div style={{ height: 12 }} />

              <Btn variant="primary" block onClick={() => { tapBigAction(); setShowFront9(false); }}>On to the Back 9</Btn>
            </div>
          </Popup>
        );
      })()}

      {/* CTP popup — asks who was Closest to Pin when a par-3 completes for this group.
          Tournament-wide CTP: one winner per par-3 per round. Every group gets the
          prompt as they finish the hole; an earlier group's tag shows in the "current
          CTP" leader bar so this group knows the number to beat, and either claims it
          with a shorter distance or passes. Blocks auto-advance until answered.
          Explicit buttons only — no backdrop dismiss (we want a real answer). */}
      {showCtpForHole !== null && (() => {
        const holeNum = showCtpForHole + 1;
        const leader = ((ctpData || {})[round] || {})[holeNum];
        const leaderPl = leader ? players.find(p => p.id === leader.playerId) : null;
        const leaderDist = leader ? (leader.distanceFt ? `${leader.distanceFt} ft` : (leader.distance || "")) : "";
        const closeAndAdvance = () => { setShowCtpForHole(null); setCtpPickPlayer(""); };
        // Was this tag made by a group PLAYING BEHIND us? A group that walks
        // off a par 3 to make its tee time and puts the hole in fifteen
        // minutes later is shown a "current CTP" that did not exist when they
        // were on the green. Without saying so, the number reads as the group
        // ahead of them — and the tie rule, which hands the pin to whoever
        // tagged first, quietly runs backwards. See lib/ctp.
        const myTeeOrder = groupTeeOrder(pairingsData, round, group);
        const outOfOrder = leader ? tagAheadOfPlay({
          leaderOrder: leader.taggedGroupOrder,
          leaderKey: leader.taggedGroupKey,
          myOrder: myTeeOrder,
          myKey: _groupKey,
        }) : null;
        // Beating the standing tag is a strictly-shorter distance. Equal isn't closer —
        // ties keep the earlier group's tag (first to hole it holds the pin).
        // Undecided is not "beats it": until a distance is chosen there is
        // nothing to compare, so the question simply has not been answered.
        const chosen = ctpFeet != null;
        const beatsLeader = !leader || !leader.distanceFt || (chosen && ctpFeet < leader.distanceFt);
        // BOTH halves, deliberately. A name with no distance is a claim
        // nobody measured, and it would go onto the card looking like one
        // somebody did.
        const canTag = !!ctpPickPlayer && chosen && beatsLeader;
        const save = async () => {
          if (!canTag) return;
          tapBigAction();
          try { await onSetCtp?.(round, holeNum, ctpPickPlayer, ctpFeet, { key: _groupKey, order: myTeeOrder }); } catch {}
          closeAndAdvance();
        };
        // Wheel: park it on ctpFeetStart when the scroll node mounts, then derive feet
        // from scroll position. Snap stride === CTP_WHEEL_ITEM so a settle always lands
        // on a row.
        const wheelRef = (el) => {
          if (el && !el.dataset.init) {
            el.dataset.init = "1";
            el.scrollTop = (ctpFeetStart - 1) * CTP_WHEEL_ITEM;
          }
        };
        // A gesture, not a scroll, is what counts as choosing. Setting scrollTop above
        // fires the same scroll event a thumb does, so reading the scroll alone would
        // mark the parked value as chosen the instant the wheel appeared. Pointer,
        // touch and wheel between them cover a thumb, a stylus and a trackpad.
        const markTouched = () => { ctpWheelTouched.current = true; };
        const onWheelScroll = (e) => {
          if (!ctpWheelTouched.current) return;
          const v = Math.max(1, Math.min(CTP_MAX_FT, Math.round(e.currentTarget.scrollTop / CTP_WHEEL_ITEM) + 1));
          setCtpFeet(prev => (prev === v ? prev : v));
        };
        return (
          <Popup onClose={closeAndAdvance} maxWidth={360} dismissOnBackdrop={false} background={K.card} borderColor={K.acc + ALPHA.hair} padding={0} zIndex={350}>
            <div style={{ background: K.acc + ALPHA.wash, borderBottom: `1px solid ${K.acc}${ALPHA.hair}`, padding: "14px 20px", textAlign: "center" }}>
              <div style={{ fontSize: FS.hero, marginBottom: 4 }}>🎯</div>
              <div style={{ fontSize: FS.body, fontWeight: 800, color: K.acc, letterSpacing: 0.3 }}>Closest to Pin</div>
              <div style={{ fontSize: FS.label, color: K.t3, marginTop: 2 }}>Hole {holeNum} · Par 3</div>
            </div>
            <div style={{ padding: "14px 16px" }}>

              {/* Current-leader bar — the number to beat, tagged by an earlier group */}
              {leader && leaderPl && (
                <div style={{ background: K.warn + ALPHA.wash, border: `1px solid ${K.warn}${ALPHA.line}`, borderRadius: R.md, marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
                    <span style={{ fontSize: FS.body }}>⛳</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: FS.micro, fontWeight: 800, color: K.warn, letterSpacing: 1.2, textTransform: "uppercase" }}>Current CTP</span>
                      <span style={{ fontSize: FS.small, fontWeight: 700, color: K.t1 }}>{leaderPl.name}</span>
                    </span>
                    {leaderDist && <span style={{ fontSize: FS.small, fontWeight: 800, color: K.warn }}>{leaderDist}</span>}
                  </div>
                  {/* Tagged out of order — the group BEHIND us got in first.
                      Inside this bar rather than above it, because it is not a
                      second thing to read: it is what this number is. A group
                      that walked off to make its tee time is being shown a tag
                      from players who were still waiting to hit, and left to
                      itself the bar reads as the group ahead of them.
                      Two amber boxes stacked also read as one wall of shouting
                      on a phone in sunlight — the app's face is all caps, so
                      the copy stays short and there is only ever one box. */}
                  {outOfOrder && (
                    <div style={{ borderTop: `1px solid ${K.warn}${ALPHA.hair}`, padding: "7px 10px 8px", display: "flex", gap: 6 }}>
                      <span style={{ fontSize: FS.label }}>⏱</span>
                      <span style={{ fontSize: FS.label, color: K.t2, lineHeight: 1.45, minWidth: 0 }}>
                        <span style={{ fontWeight: 800, color: K.warn }}>{outOfOrder.label} tagged this after you finished.</span>
                        {" "}Tag it if you were closer — a tie stays theirs.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Who was closest ── */}
              {/* One card holding the whole first question: the names, and
                  the answer for when it was none of them. Passing used to sit
                  at the very bottom under Tag, which put the group's most
                  common answer furthest from the question and behind a
                  control that did not apply to them. */}
              <div style={{ background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: R.lg, padding: "10px 12px", marginBottom: 12 }}>
                <div style={{ fontSize: FS.label, fontWeight: 800, color: K.t3, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>
                  {leader ? "Who was closer?" : "Who was closest?"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                  {presentGroupPids.map(pid => {
                    const pl = players.find(p => p.id === pid);
                    if (!pl) return null;
                    const sel = ctpPickPlayer === pid;
                    return (
                      <button key={pid}
                        onClick={() => {
                          tapNudge();
                          // Changing who it was un-answers the distance: the
                          // number belonged to the other man's shot.
                          setCtpPickPlayer(sel ? "" : pid);
                          setCtpFeet(null);
                          ctpWheelTouched.current = false;
                        }}
                        style={{
                          padding: "11px 6px", borderRadius: R.md,
                          background: sel ? K.acc + ALPHA.tint : K.card,
                          border: `1px solid ${sel ? K.acc : K.bdr}`,
                          color: sel ? K.acc : K.t2,
                          fontSize: FS.small, fontWeight: 700, cursor: "pointer", textAlign: "center",
                        }}>{pl.name}</button>
                    );
                  })}
                </div>
                {/* Passing is an ANSWER, not a dismissal. A group that walks
                    off without getting inside the standing tag is saying it is
                    right, and recording that is what lets the Betting tab tell
                    "nobody has been asked" apart from "everybody has been
                    asked and it stands". The last group to confirm is the one
                    that settles the pin. */}
                <Btn variant="secondary" size="sm" block
                  onClick={async () => {
                    tapNudge();
                    if (leader) { try { await onConfirmCtp?.(round, holeNum, user?.id); } catch { /* the pass still closes */ } }
                    closeAndAdvance();
                  }}
                  style={{ color: K.t3 }}>
                  {leader ? `Confirm — ${leaderPl?.name || "the standing CTP"} keeps it` : "None of us — skip"}
                </Btn>
              </div>

              {/* ── How close ── */}
              {/* Only once somebody is claiming it. Asking a group to set a
                  distance before they have said whose shot it was is asking
                  the second question first, and the group whose answer is
                  "none of us" never needed it at all. */}
              {ctpPickPlayer && (
                <>
                  <div style={{ fontSize: FS.label, fontWeight: 800, color: K.t3, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>
                    Approx. distance
                  </div>
                  <div style={{ position: "relative", height: CTP_WHEEL_H, background: K.inp, border: `1px solid ${chosen ? K.acc + ALPHA.line : K.bdr}`, borderRadius: R.lg, overflow: "hidden", marginBottom: 10 }}>
                    {/* selection band */}
                    <div style={{ position: "absolute", left: 10, right: 10, top: "50%", height: CTP_WHEEL_ITEM + 2, transform: "translateY(-50%)", borderTop: `1.5px solid ${chosen ? K.acc : K.t3}`, borderBottom: `1.5px solid ${chosen ? K.acc : K.t3}`, borderRadius: R.xs, background: chosen ? K.acc + ALPHA.wash : "transparent", pointerEvents: "none", zIndex: 2 }} />
                    <div style={{ position: "absolute", right: 46, top: "50%", transform: "translateY(-50%)", fontSize: FS.label, fontWeight: 800, color: chosen ? K.acc : K.t3, letterSpacing: 1.2, pointerEvents: "none", zIndex: 2 }}>FT</div>
                    <div
                      ref={wheelRef}
                      onScroll={onWheelScroll}
                      onPointerDown={markTouched}
                      onTouchStart={markTouched}
                      onWheel={markTouched}
                      style={{ height: "100%", overflowY: "scroll", scrollSnapType: "y mandatory", padding: `${(CTP_WHEEL_H - CTP_WHEEL_ITEM) / 2}px 0`, WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
                    >
                      {Array.from({ length: CTP_MAX_FT }, (_, i) => i + 1).map(ft => (
                        <div key={ft} style={{ height: CTP_WHEEL_ITEM, lineHeight: `${CTP_WHEEL_ITEM}px`, textAlign: "center", fontSize: ft === ctpFeet ? FS.title : FS.lead, fontWeight: ft === ctpFeet ? 800 : 700, color: ft === ctpFeet ? K.t1 : K.t3, scrollSnapAlign: "center" }}>
                          {ft}
                        </div>
                      ))}
                    </div>
                    {/* edge fades */}
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 46, background: `linear-gradient(${K.inp}, transparent)`, pointerEvents: "none" }} />
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 46, background: `linear-gradient(transparent, ${K.inp})`, pointerEvents: "none" }} />
                  </div>

                  {/* Why the tag button is dead — surfaced instead of leaving it mysteriously grey */}
                  {!chosen && (
                    <div style={{ fontSize: FS.label, color: K.t3, textAlign: "center", marginBottom: 8, lineHeight: 1.4 }}>
                      Spin the wheel to set how close {players.find(p => p.id === ctpPickPlayer)?.name.split(" ")[0] || "they"} was.
                    </div>
                  )}
                  {chosen && !beatsLeader && (
                    <div style={{ fontSize: FS.label, color: K.warn, textAlign: "center", marginBottom: 8, lineHeight: 1.4 }}>
                      {ctpFeet === leader.distanceFt
                        ? `Tied with ${leaderPl?.name || "the current CTP"} — the earlier tag holds.`
                        : `Not inside ${leaderDist} — ${leaderPl?.name || "the current CTP"} keeps it.`}
                    </div>
                  )}

                  <Btn block disabled={!canTag} onClick={save} style={{ letterSpacing: 0.5 }}>{leader ? "Tag New CTP" : "Tag CTP"}</Btn>
                </>
              )}
            </div>
          </Popup>
        );
      })()}

      {/* WD confirmation modal */}
      {wdConfirm && (
        <Popup onClose={() => setWdConfirm(null)} maxWidth={340} dismissOnBackdrop={false} background={K.card} borderColor={K.danger + ALPHA.line} padding={0} overlayPadding={24} zIndex={400}>
              <div style={{ background: K.danger + ALPHA.wash, borderBottom: `1px solid ${K.danger}${ALPHA.hair}`, padding: "16px 20px", textAlign: "center" }}>
                <div style={{ fontSize: FS.hero, marginBottom: 6 }}>⛳</div>
                <div style={{ fontSize: FS.body, fontWeight: 800, color: K.danger }}>Withdraw Player</div>
              </div>
              <div style={{ padding: "16px 20px", textAlign: "center" }}>
                <div style={{ fontSize: FS.small, color: K.t1, fontWeight: 600, marginBottom: 6 }}>
                  {players.find(p => p.id === wdConfirm)?.name} has withdrawn from the WBC.
                </div>
                <div style={{ fontSize: FS.label, color: K.t3, lineHeight: 1.5 }}>
                  Remaining holes will be marked WD. Any completed holes count toward the skins game. This cannot be undone.
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, padding: "0 16px 16px" }}>
                <Btn variant="secondary" size="sm" onClick={() => setWdConfirm(null)} style={{ flex: 1, color: K.t2 }}>Cancel</Btn>
                <Btn variant="danger" size="sm" onClick={() => { markPlayerWD(wdConfirm); setWdConfirm(null); }} style={{ flex: 1 }}>Confirm WD</Btn>
              </div>
        </Popup>
      )}

      {/* Finalize confirmation modal with mini scorecards */}
      {showFinalize && (() => {
        const finalizeMissing = [];
        groupPlayers.forEach(p => {
          const scores = holeData[`${p.id}_${round}`] || {};
          const missingHoles = [];
          for (let h = 0; h < 18; h++) { if (!(scores[h] > 0)) missingHoles.push(h + 1); }
          if (missingHoles.length > 0) finalizeMissing.push({ name: p.name, holes: missingHoles });
        });
        return (
          <Popup onClose={() => setShowFinalize(false)} maxWidth={400} background={K.card} zIndex={1000}>
              <div style={{ textAlign: "center", marginBottom: 10 }}>
                <div style={{ fontSize: FS.body, fontWeight: 800, color: K.t1 }}>Sign Scorecard — Round {round}</div>
                {course && <div style={{ fontSize: FS.label, color: K.acc, fontWeight: 600, marginTop: 2 }}>{course.name}</div>}
              </div>
              {finalizeMissing.length > 0 && (
                <div style={{ background: K.warn + ALPHA.wash, border: `1px solid ${K.warn}${ALPHA.hair}`, borderRadius: R.sm, padding: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: FS.label, color: K.warn, fontWeight: 600, marginBottom: 4 }}>⚠️ Missing scores</div>
                  {finalizeMissing.map(m => (
                    <div key={m.name} style={{ fontSize: FS.label, color: K.t2 }}>
                      <span style={{ fontWeight: 600 }}>{m.name}</span>: holes {m.holes.join(", ")}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ height: 4 }} />

              {/* Mini scorecards per player */}
              {groupPlayers.map(p => {
                const tp = tPlayers.find(t => t.player_id === p.id);
                const hi = parseFloat(tp?.handicap_index) || 0;
                const tee = getPlayerTee(round, p.id, course);
                const ch = calcCH(hi, tee?.slope || course.slope, tee?.rating || course.rating, tee?.par || course.par);
                const scores = holeData[`${p.id}_${round}`] || {};
                let gross = 0, net = 0, frontGross = 0, backGross = 0;
                const sorted = holeHcps.map((h, i) => ({ idx: i, hcp: h })).sort((a, b) => a.hcp - b.hcp);
                const strokeMap = {};
                let rem = Math.abs(ch);
                for (let pass = 0; pass < 3 && rem > 0; pass++) {
                  for (const h of sorted) { if (rem <= 0) break; strokeMap[h.idx] = (strokeMap[h.idx] || 0) + 1; rem--; }
                }
                for (let h = 0; h < 18; h++) {
                  if (scores[h]) {
                    const g = scores[h]; const st = strokeMap[h] || 0;
                    gross += g; net += g - st;
                    if (h < 9) { frontGross += g; } else { backGross += g; }
                  }
                }
                const parTotal = holePars.reduce((a, b) => a + b, 0);
                const cellBorder = `1px solid ${K.bdr}${ALPHA.line}`;
                const renderHalf = (startH, endH, subtotal) => (
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${endH - startH}, 1fr) 28px`, borderTop: cellBorder }}>
                    {/* Hole numbers row */}
                    {Array.from({ length: endH - startH }, (_, i) => startH + i).map(h => (
                      <div key={`n${h}`} style={{ textAlign: "center", fontSize: FS.micro, fontWeight: 600, color: K.t3, padding: "2px 0", borderRight: cellBorder, borderBottom: cellBorder }}>
                        {h + 1}
                      </div>
                    ))}
                    <div style={{ textAlign: "center", fontSize: FS.micro, fontWeight: 600, color: K.t3, padding: "2px 0", borderBottom: cellBorder }}>{startH === 0 ? "Out" : "In"}</div>
                    {/* Score row */}
                    {Array.from({ length: endH - startH }, (_, i) => startH + i).map(h => {
                      const s = scores[h];
                      const d = s ? s - holePars[h] : null;
                      return (
                        <div key={`s${h}`} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", borderRight: cellBorder, height: 26 }}>
                          {s && d != null && d !== 0 && (
                            <>
                              <div style={{
                                position: "absolute",
                                width: 18, height: 18,
                                borderRadius: d < 0 ? "50%" : R.xs,
                                border: `1px solid rgba(180,180,180,0.3)`,
                              }} />
                              {(d <= -2 || d >= 2) && (
                                <div style={{
                                  position: "absolute",
                                  width: 13, height: 13,
                                  borderRadius: d < 0 ? "50%" : R.xs,
                                  border: `1px solid rgba(180,180,180,0.3)`,
                                }} />
                              )}
                            </>
                          )}
                          <span style={{ position: "relative", fontSize: FS.small, fontWeight: 700, color: s ? K.t1 : K.t3 + ALPHA.hair }}>
                            {s || "—"}
                          </span>
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS.small, fontWeight: 800, color: K.t2, height: 26 }}>{subtotal || "—"}</div>
                  </div>
                );
                return (
                  <div key={p.id} style={{ background: K.inp, borderRadius: R.sm, marginBottom: 8, overflow: "hidden", border: `1px solid ${K.bdr}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", borderBottom: cellBorder }}>
                      <span style={{ fontSize: FS.small, fontWeight: 700, color: K.t1 }}>{p.name}</span>
                      <div style={{ display: "flex", gap: 8, fontSize: FS.small }}>
                        <span style={{ color: K.t3 }}>Gross <strong style={{ color: K.t2 }}>{gross || "—"}</strong></span>
                        <span style={{ color: K.t3 }}>Net <strong style={{ color: net && (net - parTotal) < 0 ? K.under : K.t1 }}>{net || "—"}</strong></span>
                      </div>
                    </div>
                    {renderHalf(0, 9, frontGross)}
                    {renderHalf(9, 18, backGross)}
                  </div>
                );
              })}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button onClick={() => setShowFinalize(false)} style={{
                  flex: 1, padding: "10px 0", borderRadius: R.md, background: K.inp, border: `1px solid ${K.bdr}`,
                  color: K.t2, fontSize: FS.small, fontWeight: 600, cursor: "pointer",
                }}>✏️ Edit Scores</button>
                <button onClick={handleSign} style={{
                  flex: 1, padding: "10px 0", borderRadius: R.md, background: finalizeMissing.length > 0 ? K.warn : K.acc, border: "none",
                  color: K.bg, fontSize: FS.small, fontWeight: 700, cursor: "pointer",
                }}>{finalizeMissing.length > 0 ? "Sign Anyway" : "✍️ Sign Scorecard"}</button>
              </div>
          </Popup>
        );
      })()}

      {/* Sits ON the app header rather than below it. At top: 80 this landed
          across the hole strip — the one part of the screen a player might be
          reaching for while it is up, since the toast is showing precisely
          when the group has just finished a hole and somebody wants to check
          or correct the one before it. The header underneath is a logo and a
          caption: nothing to tap, and nothing that changes in the second and
          a half this covers it. Offset from the same safe-area inset the
          header uses so it stays centred on that band on a notched phone. */}
      {allScored && currentHole < 17 && navSource === "auto" && !editingCompleted && (
        <div style={{ position: "fixed", top: `calc(${HEADER_SAFE_PAD} + 9px)`, left: "50%", transform: "translateX(-50%)", background: K.acc, color: K.bg, padding: "12px 48px", borderRadius: R.lg, fontSize: FS.small, fontWeight: 700, zIndex: 1000, whiteSpace: "nowrap", minWidth: 280, textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", animation: "toastDown 0.3s ease", pointerEvents: "none" }}>
          ✓ Hole {currentHole + 1} saved — advancing...
        </div>
      )}
      {/* Round complete — on the header band, same as the advancing toast, and
          for a sharper reason: this one does not time out. It stays up until
          the card is signed, and at top: 80 it sat across the hole strip for
          as long as it was there — so a group that finished and then wanted to
          fix hole 3 had the way back to hole 3 covered by it.
          It is a BAR rather than a centred pill: it runs from the left edge to
          88px short of the right, which leaves the header's crown — the
          director's group switcher, the one live control up here — uncovered
          and tappable the whole time this is showing. */}
      {/* On a hole this group already finished — same band, same geometry as
          Round complete, in the warning colour. It has to live out here rather
          than up with the read-only scores it explains: the hole content is
          wrapped in a transformed div for the slide animation, and a transform
          makes its box the containing block for anything `position: fixed`
          inside it, which would drop this bar into the middle of the screen.
          "Resume Hole 18 →" shortens to "Hole 18 →" — the row has three things
          on it now, and the green button is self-evidently the way onward. */}
      {onCompletedHole && (
        <HoleStateBar glyph="✓" label={`Hole ${currentHole + 1} already scored`}>
          <button onClick={() => setEditingCompleted(true)} style={holeBarBtn(K.warn)}>✏️ Edit</button>
          <button onClick={returnToPlay} style={holeBarBtn(K.acc)}>Hole {findNextIncompleteHole() + 1} →</button>
        </HoleStateBar>
      )}
      {/* The other half of the same state, and now the same bar: you tapped
          Edit, the cards below went live, and this stays pinned to say which
          hole you are editing and how to get back to the live one. It was an
          inline strip above the cards, which scrolled away exactly when you
          were deepest into the thing it was warning you about. */}
      {editingCompleted && (
        <HoleStateBar glyph="✎" label={`Editing hole ${currentHole + 1}`}>
          <button onClick={returnToPlay} style={holeBarBtn(K.acc)}>Hole {findNextIncompleteHole() + 1} →</button>
        </HoleStateBar>
      )}
      {allRoundComplete && !isGroupFinalized && !isSigned && !showFinalize && !onCompletedHole && (
        <div style={{ position: "fixed", top: `calc(${HEADER_SAFE_PAD} + 6px)`, left: 12, right: 88, display: "flex", alignItems: "center", gap: 10, background: K.acc, color: K.bg, padding: "10px 14px", borderRadius: R.lg, fontSize: FS.small, fontWeight: 700, zIndex: 1000, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", animation: "toastDownBar 0.3s ease" }}>
          <span style={{ flex: 1 }}>🏆 Round complete!</span>
          <button onClick={() => setShowFinalize(true)} style={{ background: K.bg, color: K.acc, border: "none", borderRadius: R.sm, padding: "6px 14px", fontSize: FS.small, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>Sign Scorecard</button>
        </div>
      )}
    </div>
  );
}

// ── GROUP SETUP ──
function GroupSetup({ user, players, onStart, presetGroup }) {
  const [selected, setSelected] = useState(presetGroup || [user.id]);

  const toggle = (id) => {
    if (id === user.id) return;
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 4 ? [...prev, id] : prev);
  };

  return (
    <div>
      {presetGroup && (
        <button onClick={() => onStart(presetGroup)} style={{
          width: "100%", padding: "14px 0", borderRadius: R.xl, marginBottom: 12,
          background: `linear-gradient(135deg, ${K.acc}, ${K.accDim})`,
          color: K.bg, border: "none", fontSize: FS.lead, fontWeight: 800, cursor: "pointer",
          boxShadow: `0 4px 20px ${K.accGlow}`,
        }}>
          Start Round — {presetGroup.length} Players ⛳
        </button>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <span style={{ fontFamily: "'Montserrat', sans-serif", fontSize: FS.lead, fontWeight: 800 }}>Group Setup</span>
          <span style={{ fontSize: FS.small, color: K.t3, marginLeft: 8 }}>{selected.length} player{selected.length !== 1 ? "s" : ""}</span>
        </div>
        {selected.length >= 2 && (
          <button onClick={() => onStart(selected)} style={{
            padding: "8px 20px", borderRadius: R.md,
            background: `linear-gradient(135deg, ${K.acc}, ${K.accDim})`,
            color: K.bg, border: "none", fontSize: FS.small, fontWeight: 800, cursor: "pointer",
            boxShadow: `0 2px 12px ${K.accGlow}`,
          }}>Done ⛳</button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {players.map(p => {
          const isSelf = p.id === user.id;
          const isSelected = selected.includes(p.id);
          return (
            <button key={p.id} onClick={() => toggle(p.id)} style={{
              background: isSelected ? K.accGlow : K.card,
              border: `1.5px solid ${isSelected ? K.acc : K.bdr}`,
              borderRadius: R.md, padding: "10px 14px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              cursor: isSelf ? "default" : "pointer", color: K.t1,
              opacity: !isSelected && selected.length >= 4 ? 0.4 : 1,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: R.sm,
                  background: isSelected ? K.acc : K.inp,
                  border: `1.5px solid ${isSelected ? K.acc : K.bdr}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: isSelected ? K.bg : K.t3, fontSize: FS.small, fontWeight: 800,
                }}>{isSelected ? "✓" : ""}</div>
                <span style={{ fontWeight: 600, fontSize: FS.small }}>{p.name}{isSelf ? " (you)" : ""}</span>
              </div>
              <span style={{ fontSize: FS.label, color: K.t3 }}>HI: {p.handicap_index}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── BETTING ──
//
// The three side games that run across the whole tournament rather than
// inside any one round. They are built on three different principles, and the
// difference is the point:
//
//   SKINS ARE DERIVED, never stored. Low score on a hole takes it, a tie
//   pushes it, and the pot divides by however many were won. There is no
//   skins editor anywhere in the app on purpose — a stored winner is a second
//   answer that can disagree with the card, and the card is the one the group
//   signed. See lib/sideGames.
//
//   CTP IS CAPTURED, because it is the one thing here the card does not
//   record. Groups tag their own par 3s from the Scoring tab as they walk off
//   the green, and the director settles each hole from this screen.
//
//   THE MARKET IS BET. Twenty shares before the tournament starts, ten more
//   once the halfway round is complete, spread across any golfers you like;
//   the pot divides by the shares held on whoever wins. See lib/market.
//
// What all four share is the money: a director tags who bought in and what a
// seat costs, and every pot on this screen is counted from that.
//
// `players` is the WHOLE roster, withdrawals included — not the active field
// every other screen takes. A man who paid his buy-ins and walked in on
// Saturday still owes them, still has his money in the pot, and still keeps
// the skins and the pin he won before he went; leaving him off the collection
// sheet loses the director money and leaving him out of the field quietly
// shrinks every pot he paid into. Each game decides for itself what a
// withdrawal means to it — computeSkins skips the WD sentinel hole by hole
// (which is the rule the withdraw dialog states: completed holes count), and
// lowNetRounds drops a withdrawn card outright.
function BettingView({
  players, round, tRounds, courses, holeData, ctpData, onSetCtp, user, numRounds,
  getPlayerTee, getPlayerCH = () => null,
  sideGames, onUpdateSideGames, marketBets, onSaveMarketBet, leaderboard,
  finalizedRounds, pairingsData, firstTeeAt, marketNudge, teeTimesData, roundDates,
}) {
  const [tab, setTab] = useState("skins");
  const [expandedPlayer, setExpandedPlayer] = useState(null);
  const [grossMode, setGrossMode] = useState(true);
  // Which round's full field is open in the Low Net ledger. One at a time —
  // four open rounds is the same wall of numbers the ledger exists to avoid.
  const [openNetRound, setOpenNetRound] = useState(null);
  // Whose pins are itemized in the CTP leaders card.
  const [openCtpPlayer, setOpenCtpPlayer] = useState(null);
  // Each tab keeps its OWN round and its own open drawer. Sharing them would
  // mean opening one tab silently rearranged the other.
  const [skinsRound, setSkinsRound] = useState(null);
  const [ctpRound, setCtpRound] = useState(null);
  // ONE buy-in sheet, opened from any of the three pot cards. It used to be a
  // drawer per game, which meant the director's real job — working out what
  // each man owes across all four buy-ins — was four panels and a running
  // total held in their head.
  const [showBuyIns, setShowBuyIns] = useState(false);
  const [editPot, setEditPot] = useState(false);
  const [potInput, setPotInput] = useState("");
  // Director CTP override — hole currently being edited, plus the pending winner/feet.
  const [editCtpHole, setEditCtpHole] = useState(null);
  const [editCtpPlayer, setEditCtpPlayer] = useState("");
  const [editCtpFeet, setEditCtpFeet] = useState("");
  // The market: whose book is on screen, which window is being placed, and the
  // unsaved draft. A bet is not auto-saved the way a buy-in toggle is — moving
  // shares between two golfers is two taps that are only correct together.
  const [bookFor, setBookFor] = useState(null);
  const [bookWindow, setBookWindow] = useState(null);
  const [draft, setDraft] = useState(null);
  const [openHolder, setOpenHolder] = useState(null);
  // The director's shares worklist — who has handed their picks in and who
  // has not. Its own drawer rather than a section of the book, because it is
  // the INDEX into the book, not part of it.
  const [showRoster, setShowRoster] = useState(false);
  const { confirm, confirmModal } = useConfirm();
  // The bell has to ring on a screen nobody is touching. A player sitting on
  // this tab at 6:59 must watch the market shut at 7:00 rather than find out
  // by navigating away and back — so the clock ticks, but only while there is
  // something for it to close, and stops the moment it has.
  const [now, setNow] = useState(() => Date.now());

  // Gross is the default, so this never fires on arrival: reaching Net always
  // means somebody crossed the toggle to get there, which is a deliberate act
  // and therefore fair game. Fires every time they do it, which is the joke.
  //
  // It does NOT change the mode — Net stays selected behind the notice —
  // because the point is the comment, not the veto. `alert` gives it one OK
  // button rather than a choice, so it has to be dismissed rather than
  // drifting past like a toast.
  const pickMode = (gross) => {
    setGrossMode(gross);
    if (!gross) {
      confirm({
        title: "NET skins?!",
        message: "This is for entertainment purposes only, real men don't play net skins.",
        alert: true,
      });
    }
  };

  // The book lives above the holders list, so a director who taps Edit five
  // rows down has to be taken back to it — otherwise the selector changes off
  // screen and the tap looks like it did nothing.
  const bookRef = useRef(null);

  // ── Who is playing for what ──
  const skinsField = fieldFor(sideGames?.skins?.in, players);
  const ctpField = fieldFor(sideGames?.ctp?.in, players);
  const marketField = fieldFor(sideGames?.market?.in, players);
  const ctpInSet = new Set(ctpField.map(p => p.id));
  const marketInSet = new Set(marketField.map(p => p.id));

  const skinsCounted = (sideGames?.skins?.amount || 0) > 0;
  const skinsPot = potFor({ amount: sideGames?.skins?.amount, count: skinsField.length, typed: sideGames?.skins?.pot });
  const ctpPot = potFor({ amount: sideGames?.ctp?.amount, count: ctpField.length });
  const lowNetField = fieldFor(sideGames?.lownet?.in, players);
  const lowNetPot = potFor({ amount: sideGames?.lownet?.amount, count: lowNetField.length });

  // ── Which round a tab lands on ──
  // The most recent round anybody has actually played, which is not the same
  // question as which round the app is ON: on the morning of Round 2 the app
  // points at a round with nothing in it while Round 1's results sit one tap
  // away. It follows the play on its own until somebody taps a round, and from
  // then on that choice stands.
  const roundList = Array.from({ length: numRounds }, (_, i) => i + 1);
  const playedRounds = roundList.filter(r =>
    players.some(p => Object.values(holeData[`${p.id}_${r}`] || {}).some(v => v > 0)));
  const defaultRound = playedRounds.length ? playedRounds[playedRounds.length - 1] : (roundList.includes(round) ? round : roundList[0]);
  const shownRound = roundList.includes(skinsRound) ? skinsRound : defaultRound;
  const ctpShownRound = roundList.includes(ctpRound) ? ctpRound : defaultRound;

  // A round's course and its two hole tables, resolved once.
  const roundSetup = (r) => {
    const tr = tRounds.find(t => t.round_number === r);
    const course = tr ? courses.find(c => c.id === tr.course_id) : null;
    return { tr, course, pars: course?.hole_pars || [], hcps: course?.hole_handicaps || [] };
  };

  // Every player's stroke allocation for a round, plus the signed course
  // handicap it came from — a plus player gives strokes back, so the sign has
  // to travel with the map. Gross mode needs neither.
  const strokesFor = (r) => {
    const { course } = roundSetup(r);
    const maps = {}; const chs = {};
    skinsField.forEach(p => {
      // Same precedence as the leaderboard: a RECORDED handicap wins over a
      // derived one. This is the second place the app turns an index into
      // strokes, and it has to agree with the first — on a flat imported year
      // calcCH gives out the wrong NUMBER of strokes, not merely the wrong
      // holes, so net skins would disagree with the leaderboard beside it.
      const recorded = getPlayerCH(r, p.id);
      const tee = course ? getPlayerTee(r, p.id, course) : null;
      const ch = Number.isFinite(recorded)
        ? recorded
        : course
          ? calcCH(p.handicap_index, tee?.slope || course.slope, tee?.rating || course.rating, tee?.par || course.par)
          : 0;
      chs[p.id] = ch;
      maps[p.id] = buildStrokesMap(ch, course?.hole_handicaps || []);
    });
    return { maps, chs };
  };

  // What computeSkins needs for a round, in the mode currently selected.
  const skinsSetup = (r) => {
    const { pars } = roundSetup(r);
    if (grossMode) return { pars };
    const { maps, chs } = strokesFor(r);
    return { pars, strokeMaps: maps, chFor: (pid) => chs[pid] || 0 };
  };

  const won = allSkins({ players: skinsField, holeData, rounds: roundList, roundSetup: skinsSetup });
  const skinTotals = skinCounts(won);
  const totalSkinsWon = won.length;
  const perSkin = perUnit(skinsPot, totalSkinsWon);
  const shownSkins = computeSkins({ players: skinsField, holeData, round: shownRound, ...skinsSetup(shownRound) });

  // ── The CTP tab ──
  // Read through each round's OWN par table rather than straight off ctpData:
  // a record left on a hole that is no longer a par 3 — a course re-pointed
  // after the fact — would otherwise keep counting on a hole the tab no longer
  // shows. A tag naming somebody who is not in the CTP game does not score; it
  // still shows on its hole, because the document is the hole's answer, but
  // the board and the payout are for the players who bought in.
  const par3sFor = (r) => (roundSetup(r).pars || []).map((p, i) => (p === 3 ? i + 1 : null)).filter(Boolean);
  const ctpTags = roundList.flatMap(r =>
    par3sFor(r).flatMap(hole => {
      const rec = (ctpData[r] || {})[hole];
      return rec?.playerId && ctpInSet.has(rec.playerId) ? [{ round: r, hole, ...rec }] : [];
    }));
  const ctpLeaders = Object.values(ctpTags.reduce((acc, t) => {
    const e = acc[t.playerId] || (acc[t.playerId] = { pid: t.playerId, count: 0, best: null });
    e.count += 1;
    if (t.distanceFt != null && (e.best == null || t.distanceFt < e.best)) e.best = t.distanceFt;
    return acc;
  }, {}))
    // Most pins, then the closest single shot among equals — the tiebreak the
    // players would use themselves.
    .sort((a, b) => b.count - a.count || (a.best ?? Infinity) - (b.best ?? Infinity));
  const noPar3s = roundList.every(r => par3sFor(r).length === 0);
  // Every par 3 in the tournament, which is what the pot divides by — see
  // perUnit. It counts the holes on the courses as they are ASSIGNED, so a
  // round with no course yet contributes nothing and the per-pin figure
  // settles as the schedule fills in.
  const par3Count = roundList.reduce((n, r) => n + par3sFor(r).length, 0);
  const perPin = perUnit(ctpPot, par3Count);
  // A pin is PROVISIONAL while its round is live — a group still out can get
  // inside it — and FINAL the moment the round is done, which is the last
  // group signing its card or the director finalizing from Admin. Derived
  // rather than stamped on each tag, so un-finalizing a round correctly
  // un-settles its pins. See lib/groupSwitch roundFinalized.
  const roundSettled = (r) => roundFinalized(finalizedRounds, pairingsData, r);

  // ── The Low Net tab ──
  // One round line per player, resolved exactly the way the leaderboard
  // resolves it — same tee, same course handicap, same computeRoundLine — so
  // the low net paid here and the number on the board are the same number by
  // construction rather than by two implementations agreeing.
  const lineFor = (pid, r) => {
    const { course } = roundSetup(r);
    if (!course) return null;
    const p = players.find(x => x.id === pid);
    const tee = getPlayerTee(r, pid, course);
    const ch = calcCH(p?.handicap_index, tee?.slope || course.slope, tee?.rating || course.rating, tee?.par || course.par);
    return computeRoundLine({
      scores: holeData[`${pid}_${r}`] || {},
      holePars: course.hole_pars || [],
      holeHcps: course.hole_handicaps || [],
      ch,
    });
  };
  // The pot divides by the rounds the event HAS, not the rounds decided so
  // far — same reasoning as a CTP pin. A day's share is known before anybody
  // tees off, so winning Thursday is worth the same whatever happens Friday.
  const lowNetPerRound = perUnit(lowNetPot, roundList.length);
  const lowNetRows = lowNetRounds({ players: lowNetField, rounds: roundList, lineFor });

  // The round's tee sheet as one line — first off to last off. A round
  // nobody has finished has no result to print, and "nobody has finished
  // yet" only says what the empty row already says; when it goes off is the
  // thing somebody looking at an unplayed round actually wants.
  const teeWindowFor = (r) => {
    const mins = ((teeTimesData || {})[r] || []).map(teeTimeToMinutes).filter(m => Number.isFinite(m));
    if (mins.length === 0) return null;
    const lo = Math.min(...mins), hi = Math.max(...mins);
    return lo === hi ? minutesToTimeStr(lo) : `${minutesToTimeStr(lo)} – ${minutesToTimeStr(hi)}`;
  };

  // ── The market tab ──
  // ── The opening bell ──
  // `firstTeeAt` — round one's earliest tee time — is when the market shuts.
  // See lib/market teeOffAt for why a clock rather than the first score. It
  // arrives as a prop rather than being derived here because the header
  // counts down to the same instant, and two derivations of one moment is one
  // more than the number that can be right.
  // Round 3's earliest tee time — the halfway window's own bell, derived the
  // same way the opening one is. Both windows close on a clock now, which is
  // what lets both of them be counted down to.
  const midTeeAt = (() => {
    const mr = midRoundFor(numRounds);
    if (mr == null) return null;
    const mins = ((teeTimesData || {})[mr + 1] || []).map(teeTimeToMinutes).filter(m => Number.isFinite(m));
    return mins.length === 0 ? null : teeOffAt((roundDates || {})[mr + 1], mins);
  })();
  const windows = marketWindows({ holeData, players, numRounds, firstTeeAt, midTeeAt, now });
  // Each window's own clock, and the tone it prints in. Null when there is
  // nothing left to count — a bell already rung, a window not yet open, or a
  // round with no tee sheet to ring one from.
  const clockFor = (w) => (w.open && w.at != null && w.at > now ? countdown(w.at - now) : null);
  const TONE_INK = { far: K.acc, today: K.warn, urgent: K.danger, closed: K.t3 };
  const toneFor = (w) => TONE_INK[countdownTone(w.at == null ? 0 : w.at - now, w.at, now)];
  const openingClock = clockFor(windows.opening);
  const midClock = clockFor(windows.mid);
  const anyClock = openingClock || midClock;
  // Both windows run. There is nothing left to place and nothing left to
  // choose between, so the book stops being an editor and becomes a receipt:
  // one sheet, every golfer the player actually backed, opening and halfway
  // added together. A two-tab switch over two shut windows is asking a
  // question with no answers behind it.
  //
  // Directors keep the editor. The override is the only way to enter a book
  // for a phone that died before the bell, and it has to work after the bell
  // by definition.
  const allShut = windows.opening.closed && (windows.mid.exists === false || windows.mid.closed);
  const finalSheet = allShut && !user?.isDirector;
  const bellPending = anyClock != null;
  // The clock runs for as long as there is a bell left to ring, so `now` can
  // never go stale enough to leave the market taking shares after the field
  // has teed off. What the market tab decides is only the RATE: seconds tick
  // in the last hour while somebody is watching them, and everything else
  // settles for thirty, which is already twice as often as the label above an
  // hour can change. A per-second re-render of the whole Betting view behind
  // a tab nobody is on is battery spent on nothing.
  //
  // Depending on `bellFast` rather than on the remaining milliseconds is what
  // stops the effect tearing down and rebuilding the interval every tick.
  const bellFast = anyClock != null && anyClock.urgent && tab === "market";
  useEffect(() => {
    if (!bellPending) return;
    const t = setInterval(() => setNow(Date.now()), countdownTick(bellFast ? 0 : Infinity));
    return () => clearInterval(t);
  }, [bellPending, bellFast]);
  const eventComplete = roundList.length > 0 && roundList.every(r => roundComplete(holeData, players, r));
  // ── The market is SEALED until the tournament is over ──
  // Everything a player could read another player's hand off — the board, the
  // holders, the standing payout — is held back until every round is in.
  //
  // This is not modesty. The second window exists to let somebody buy a
  // correction with two rounds of evidence, and being able to see the field's
  // book before placing turns that into copying the consensus, or worse, into
  // a coordinated block on the leader. A blind market is the game.
  //
  // The DIRECTOR sees it throughout, because somebody has to be able to fix a
  // fat-fingered allocation and settle the thing at the end. What they see is
  // marked as sealed so they know it is not what the field is looking at.
  const sealed = !eventComplete && !user?.isDirector;
  // The leader, and whether that is a RESULT or a snapshot. Only a finished
  // event pays out; until then the same board is a projection and says so.
  const leader = (leaderboard || []).find(p => !p.isWD && !p.withdrew && p.roundsPlayed > 0) || null;
  const winnerId = leader?.id || null;
  const bets = eligibleBets({ bets: marketBets, inMarket: pid => marketInSet.has(pid) });
  // ── Who owes the halfway rebuy ──
  // Nobody tags this. The second window is open to everybody in the market
  // game and the rebuy is INCURRED by placing into it, so this list is read
  // off the bets — see lib/market rebuyers. It is what the buy-in sheet's RE
  // column shows and what the second half of the market pot is counted from,
  // which is the same thing said twice on purpose: what a man owes and what
  // is in the pot are one number, and they cannot drift if only one of them
  // exists.
  const rebuyPids = new Set(rebuyers(bets));
  const rebuyField = marketField.filter(p => rebuyPids.has(p.id));
  const rebuyAmount = sideGames?.rebuy?.amount || 0;
  // Both buy-ins land in ONE pot. The rebuy is more money on the same game,
  // not a second game — which is exactly why the ten shares it buys dilute
  // the twenty everybody already holds. The pot therefore GROWS during the
  // second window as people place, which is correct: it is a live tally of
  // what is owed, not a figure fixed at the turn.
  const marketPot = potFor({ amount: sideGames?.market?.amount, count: marketField.length })
    + potFor({ amount: rebuyAmount, count: rebuyField.length });
  const board = marketBoard({ bets, players, pot: marketPot });
  const holders = marketHoldings({ bets, players });
  const payouts = marketPayouts({ bets, winnerId, pot: marketPot });

  // Whose book the editor is pointed at. A player only ever edits their own;
  // the director can point it anywhere, which is the path for the phone that
  // died before the bell.
  const myPid = user?.id || null;
  const bookPid = (user?.isDirector && bookFor) ? bookFor : myPid;
  const bookBet = bets.find(b => b.pid === bookPid) || marketBets.find(b => b.pid === bookPid) || { pid: bookPid, opening: [], mid: [] };
  // Which window the editor is placing into: the open one, unless the person
  // has picked. Both closed → the opening window, read-only.
  const activeWindow = bookWindow
    || (windows.opening.open ? "opening" : windows.mid.open ? "mid" : "opening");
  const win = activeWindow === "mid" ? windows.mid : windows.opening;
  // The halfway ten belong to whoever paid for them. Somebody who did not
  // rebuy sees the window and what it would have cost them, and cannot place
  // into it — including the director, whose override is over the CLOCK, not
  // over who has handed money across.
  // The director can place into a shut window; nobody else can.
  const canPlace = !!bookPid && marketInSet.has(bookPid) && (win.open || !!user?.isDirector);
  // Placing anything into the second window is what takes on the rebuy, so
  // the book has to say what that costs BEFORE the first tap, not after.
  const owesRebuy = !!bookPid && rebuyPids.has(bookPid);
  const draftLots = draft && draft.pid === bookPid && draft.window === activeWindow
    ? draft.lots
    : lotsFor(bookBet, activeWindow);
  const placed = totalShares(draftLots);
  const remaining = win.shares - placed;
  const dirty = !!draft && draft.pid === bookPid && draft.window === activeWindow
    && JSON.stringify(draft.lots) !== JSON.stringify(lotsFor(bookBet, activeWindow));

  const roster = marketRoster({ players: marketField, bets });

  // Point the book at somebody and bring it into view. The one action every
  // route into the editor shares — the roster row, the holders row, and the
  // dropdown all end here — so a director cannot end up editing one player
  // while looking at another's numbers.
  const openBook = (pid, windowKey = null) => {
    setBookFor(pid);
    setBookWindow(windowKey);
    setDraft(null);
    setShowRoster(false);
    // After the drawer closes, so the book is where it will finally sit.
    requestAnimationFrame(() => bookRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const bump = (pid, delta) => {
    const next = setLotShares(draftLots, pid, sharesOn(draftLots, pid) + delta, win.shares);
    setDraft({ pid: bookPid, window: activeWindow, lots: next });
  };
  // Typed entry, capped the same way the steppers are. Twenty shares is
  // twenty taps on a stepper, and a director entering the field's picks off a
  // sheet of paper is doing that sixteen times.
  const setShares = (pid, value) => {
    const next = setLotShares(draftLots, pid, value, win.shares);
    setDraft({ pid: bookPid, window: activeWindow, lots: next });
  };
  const clearWindow = () => setDraft({ pid: bookPid, window: activeWindow, lots: [] });
  const commitBook = async () => {
    const lots = activeWindow === "mid"
      ? { opening: bookBet.opening, mid: draftLots }
      : { opening: draftLots, mid: bookBet.mid };
    await onSaveMarketBet(bookPid, lots);
    setDraft(null);
  };

  // One commit path for the typed pot, reached by blur — Enter just blurs the
  // field. Committing on both fired two Firestore writes for one edit.
  const commitPot = () => {
    setEditPot(false);
    const amt = parseFloat(potInput);
    onUpdateSideGames("skins", { pot: Number.isFinite(amt) && amt > 0 ? amt : 0 });
  };

  const money = (n) => `$${(n || 0).toFixed(2)}`;

  const empty = (icon, title, sub) => (
    <Card style={{ padding: "48px 20px", textAlign: "center" }}>
      <div style={{ fontSize: FS.jumbo, marginBottom: 12, opacity: 0.4 }}>{icon}</div>
      <div style={{ fontSize: FS.lead, fontWeight: 700, color: K.t1, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: FS.small, color: K.t3, maxWidth: 280, lineHeight: 1.5, margin: "0 auto" }}>{sub}</div>
    </Card>
  );

  // ── The pot card ──
  // The same card for all three games: what is in the pot on the left, what a
  // unit of it is worth on the right, and the way into the buy-in sheet under
  // it. `typed` opts skins into its inline pot editor — it is the only game
  // with a hand-entered pot to preserve, because it is the one WBC was already
  // playing before any of this existed.
  //
  // All three cards open the SAME sheet. The buy-ins were never really three
  // lists; they were one table the director was being made to read a column
  // at a time.
  const potCard = ({ label, pot, rightTop, rightBottom, summary, typed = false }) => (
    <>
      <div style={{ background: K.card, borderRadius: R.lg, marginBottom: showBuyIns ? 0 : 10, border: `1px solid ${K.bdr}`, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: FS.label, color: K.t3, fontWeight: 700, letterSpacing: 1 }}>{label}</div>
            {/* Once a buy-in price is set the pot is COUNTED, not typed, so the
                inline editor gives way — the way to change it is to change who
                is in. */}
            {(!typed || skinsCounted) ? (
              <div style={{ fontSize: FS.title, fontWeight: 800, color: K.gold }}>{money(pot)}</div>
            ) : editPot ? (
              <input autoFocus type="number" inputMode="decimal" value={potInput}
                onChange={e => setPotInput(e.target.value)}
                onBlur={commitPot}
                onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                style={{ fontSize: FS.title, fontWeight: 800, color: K.gold, background: "transparent", border: "none", borderBottom: `1px solid ${K.acc}`, outline: "none", width: 110, fontFamily: FONT }} />
            ) : (
              // Seed the field from the LIVE pot at the moment editing opens,
              // not at mount: the value arrives from Firestore after the first
              // render, and another director can change it while this screen is
              // open. Seeding at mount meant a director who tapped in and
              // straight back out saved a stale pot over the real one.
              <div onClick={() => { if (user?.isDirector) { setPotInput(String(sideGames?.skins?.pot || 0)); setEditPot(true); } }}
                style={{ fontSize: FS.title, fontWeight: 800, color: K.gold, cursor: user?.isDirector ? "pointer" : "default" }}>
                {money(pot)}
              </div>
            )}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: FS.label, color: K.t3 }}>{rightTop}</div>
            <div style={{ fontSize: FS.body, fontWeight: 700, color: K.acc }}>{rightBottom}</div>
          </div>
        </div>
        {user?.isDirector && (
          <div
            onClick={() => setShowBuyIns(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 14px", borderTop: `1px solid ${K.bdr}` }}
          >
            <span style={{ flex: 1, fontSize: FS.label, fontWeight: 700, color: K.t3, letterSpacing: 0.6 }}>
              {summary}
            </span>
            <span style={{ fontSize: FS.label, fontWeight: 700, color: K.acc, letterSpacing: 0.6 }}>
              BUY-INS {showBuyIns ? "▾" : "▸"}
            </span>
          </div>
        )}
      </div>
      {user?.isDirector && showBuyIns && (
        <BuyInTracker
          players={players}
          games={SIDE_GAME_KEYS.map(k => ({
            key: k, ...SIDE_GAME_LABELS[k],
            amount: sideGames?.[k]?.amount || 0,
            // The rebuy column is a readout of who has placed halfway shares,
            // not a list anybody keeps. Everything else is the director's.
            paid: sideGames?.[k]?.paid ?? [],
            // The rebuy column is a readout of who has placed halfway shares,
            // not a list anybody keeps, so its membership cannot be tagged —
            // only its payment.
            ...(k === "rebuy"
              ? { ids: rebuyField.map(p => p.id), derived: true }
              : { ids: sideGames?.[k]?.in ?? null }),
          }))}
          onChange={onUpdateSideGames}
        />
      )}
    </>
  );

  // ── Scorecards ──
  // Both renderers highlight the holes the SELECTED mode won, so a gold circle
  // on a card is always the skin the tab is currently paying for.
  const skinHolesFor = (pid) => new Set(won.filter(s => s.winner.pid === pid).map(s => `${s.round}_${s.hole}`));

  // Add up a nine — or a whole card — over the holes ACTUALLY PLAYED. Par is
  // accumulated alongside rather than taken from the course total, so a man
  // walking in after thirteen gets a to-par measured against thirteen holes
  // instead of being handed five phantom pars.
  const tallyHoles = (scores, pars, holes) => {
    let gross = 0, par = 0, played = 0;
    holes.forEach(i => {
      const raw = scores[i];
      if (raw > 0 && raw < WD_SCORE) { gross += raw; par += pars[i] || 0; played += 1; }
    });
    return { gross, par, played, toPar: gross - par };
  };
  const toParStr = (n) => (n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`);

  // ── One player's week, round by round ──────────────────────────────
  // What this card is FOR is answering "where did his six skins come from",
  // and the old one made that nearly impossible: eight anonymous blocks of
  // nine, no round headings, no course names, no totals, and nothing but
  // whitespace between one round and the next. A gold circle told you a skin
  // landed but not which day it landed on.
  //
  // So each round is now its own bordered card with a heading — round, course,
  // skins taken that day, and the score — and the nines carry a ruled grid
  // with OUT and IN totals, which is the shape every golfer already knows how
  // to read.
  const renderInlineScorecard = (playerId) => {
    const p = players.find(pl => pl.id === playerId);
    if (!p) return null;
    const skinSet = skinHolesFor(playerId);
    const rows = [];
    for (const r of roundList) {
      const { course } = roundSetup(r);
      if (!course) continue;
      const scores = holeData[`${p.id}_${r}`] || {};
      if (!Object.values(scores).some(v => v > 0)) continue;
      // Strokes are only drawn in NET mode, where they are the whole
      // explanation for a gold circle sitting on an ordinary-looking number:
      // the card prints gross all week, so a skin won with a stroke is
      // otherwise a 5 that beat a field of 4s for no visible reason.
      const strokes = grossMode ? null : (strokesFor(r).maps[p.id] || {});
      rows.push({ r, scores, pars: course.hole_pars || [], courseName: course.name || "", strokes });
    }
    if (rows.length === 0) return null;

    // Two weights. `hair` rules the cells apart inside a nine — it has to be
    // visible enough to follow a column down three rows on a phone, which is
    // what the old borderless grid never let anybody do. `edge` frames the
    // round and fences off the totals.
    const hair = `1px solid ${K.bdr}${ALPHA.hair}`;
    const edge = `1px solid ${K.bdr}`;

    // Circles for under par; gold for a skin. A double circle is an eagle or
    // better, which is the convention the round card and the paper scorecard
    // both use.
    const ScoreCell = ({ score: raw, par, isSkin, strokes }) => {
      // Same rule as the field card: a WD hole is a dash, not a 99.
      const score = raw > 0 && raw < WD_SCORE ? raw : 0;
      if (!score) return <span style={{ fontSize: FS.micro, color: K.t3 }}>–</span>;
      const d = score - par;
      const isUnder = d < 0;
      const isDouble = d <= -2;
      const circleClr = isSkin ? K.gold : K.t2;
      return (
        <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 19, height: 19 }}>
          {(isUnder || isSkin) && <span style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `1.5px solid ${circleClr}` }} />}
          {isDouble && <span style={{ position: "absolute", inset: 3, borderRadius: "50%", border: `1px solid ${circleClr}` }} />}
          {/* Strokes received, as the dots they are on a paper card. */}
          {strokes > 0 && (
            <span style={{ position: "absolute", top: -2, right: -4, display: "flex", gap: 1 }}>
              {Array.from({ length: Math.min(strokes, 3) }, (_, k) => (
                <span key={k} style={{ width: 2.5, height: 2.5, borderRadius: "50%", background: K.t3 }} />
              ))}
            </span>
          )}
          <span style={{ fontSize: FS.label, fontWeight: 700, color: isSkin ? K.gold : K.t2, position: "relative", zIndex: 1 }}>{score}</span>
        </span>
      );
    };

    return (
      <div style={{ padding: "8px 10px 10px", borderTop: hair }}>
        {rows.map(({ r, scores, pars, courseName, strokes }) => {
          const all = Array.from({ length: 18 }, (_, i) => i);
          const round = tallyHoles(scores, pars, all);
          const roundSkins = won.filter(s => s.winner.pid === p.id && s.round === r).length;

          const Nine = ({ holes, label }) => {
            const t = tallyHoles(scores, pars, holes);
            // The totals column is held at a fixed width rather than a share
            // of the table, so OUT and IN line up under one another whatever
            // the hole numbers do.
            const totCell = { textAlign: "center", padding: "3px 2px", borderLeft: edge, background: `${K.bdr}${ALPHA.wash}` };
            return (
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <colgroup>
                  {holes.map((_, i) => <col key={i} />)}
                  <col style={{ width: 34 }} />
                </colgroup>
                <tbody>
                  <tr style={{ background: `${K.bdr}${ALPHA.wash}` }}>
                    {holes.map(i => {
                      const isSkin = skinSet.has(`${r}_${i}`);
                      return (
                        <td key={i} style={{
                          textAlign: "center", fontSize: FS.micro, fontWeight: isSkin ? 800 : 700,
                          color: isSkin ? K.gold : K.t2, padding: "3px 1px",
                          borderLeft: i === holes[0] ? "none" : hair,
                          borderBottom: hair,
                          // A gold TICK under the number, not a gold cell and
                          // not a full-width rule. Filling the cell makes
                          // three skins on 7-8-9 run together into one block,
                          // and an edge-to-edge underline does the same thing
                          // one step later — the column definition this
                          // rebuild exists for disappears exactly where the
                          // card matters most. Inset to 55% and it reads as
                          // three marks on three holes.
                          ...(isSkin ? {
                            backgroundImage: `linear-gradient(${K.gold}, ${K.gold})`,
                            backgroundSize: "55% 2px",
                            backgroundPosition: "center bottom",
                            backgroundRepeat: "no-repeat",
                          } : null),
                        }}>{i + 1}</td>
                      );
                    })}
                    <td style={{ ...totCell, fontSize: FS.micro, fontWeight: 800, color: K.t3, letterSpacing: 0.5, borderBottom: hair }}>{label}</td>
                  </tr>
                  <tr>
                    {holes.map(i => (
                      <td key={i} style={{
                        textAlign: "center", fontSize: FS.micro, color: K.t3, padding: "2px 1px",
                        borderLeft: i === holes[0] ? "none" : hair, borderBottom: hair,
                      }}>{pars[i] || ""}</td>
                    ))}
                    <td style={{ ...totCell, fontSize: FS.micro, color: K.t3, borderBottom: hair }}>{t.par || ""}</td>
                  </tr>
                  <tr>
                    {holes.map(i => (
                      <td key={i} style={{ textAlign: "center", padding: "2px 1px", borderLeft: i === holes[0] ? "none" : hair }}>
                        <ScoreCell score={scores[i]} par={pars[i] || 0} isSkin={skinSet.has(`${r}_${i}`)} strokes={strokes ? strokes[i] || 0 : 0} />
                      </td>
                    ))}
                    <td style={{ ...totCell, fontSize: FS.label, fontWeight: 800, color: K.t1 }}>{t.gross || "–"}</td>
                  </tr>
                </tbody>
              </table>
            );
          };

          return (
            <div key={r} style={{ border: edge, borderRadius: R.sm, overflow: "hidden", marginBottom: 8 }}>
              {/* Which round, which course, what it was worth. The heading is
                  the entire point of the rebuild — without it the grids below
                  are eight interchangeable blocks of nine numbers. */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 7px", background: `${K.bdr}${ALPHA.wash}`, borderBottom: edge }}>
                <span style={{ fontSize: FS.micro, fontWeight: 800, color: K.acc, letterSpacing: 0.5, flexShrink: 0 }}>RD {r}</span>
                <span style={{ fontSize: FS.micro, color: K.t3, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{courseName}</span>
                {roundSkins > 0 && (
                  <span style={{ fontSize: FS.micro, fontWeight: 800, color: K.gold, flexShrink: 0 }}>
                    {roundSkins} SKIN{roundSkins !== 1 ? "S" : ""}
                  </span>
                )}
                {/* A card still out on the course says so, rather than showing
                    a total that looks like a finished round eight shots low. */}
                {round.played < 18 && (
                  <span style={{ fontSize: FS.micro, fontWeight: 700, color: K.t3, flexShrink: 0 }}>THRU {round.played}</span>
                )}
                <span style={{ fontSize: FS.label, fontWeight: 800, color: K.t1, flexShrink: 0 }}>{round.gross}</span>
                {/* Under par is RED, the same rule the leaderboard total
                    follows. A negative number in golf is red — teal here
                    was the app saying "accent" where the game says "under
                    par", and the two are not the same thing. */}
                <span style={{ fontSize: FS.micro, fontWeight: 800, color: round.toPar < 0 ? K.under : K.t3, flexShrink: 0, minWidth: 18, textAlign: "right" }}>
                  {toParStr(round.toPar)}
                </span>
              </div>
              <Nine holes={Array.from({ length: 9 }, (_, i) => i)} label="OUT" />
              <div style={{ height: 1, background: `${K.bdr}${ALPHA.line}` }} />
              <Nine holes={Array.from({ length: 9 }, (_, i) => i + 9)} label="IN" />
            </div>
          );
        })}
        {/* One line, once, at the foot of the whole card — the two circles are
            not self-explanatory and a player asked to take them on trust will
            read a birdie as a skin. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: FS.micro, color: K.t3, paddingTop: 2 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 11, height: 11, borderRadius: "50%", border: `1.5px solid ${K.gold}`, display: "inline-block" }} /> SKIN
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 11, height: 11, borderRadius: "50%", border: `1.5px solid ${K.t2}`, display: "inline-block" }} /> UNDER PAR
          </span>
          {!grossMode && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 3, height: 3, borderRadius: "50%", background: K.t3, display: "inline-block" }} /> STROKE
            </span>
          )}
        </div>
      </div>
    );
  };

  // Full round scorecard grid — everybody in the skins game, skins highlighted.
  const renderRoundScorecard = () => {
    const { course } = roundSetup(shownRound);
    if (!course) return (
      <Card style={{ padding: 20, textAlign: "center", color: K.t3, fontSize: FS.small }}>No course set for Round {shownRound}</Card>
    );
    const pars = course.hole_pars || [];
    const skinByHole = {};
    shownSkins.filter(s => s.winner).forEach(s => { skinByHole[s.hole] = s; });
    const allHoles = Array.from({length: 18}, (_, i) => i);
    const front9 = allHoles.slice(0, 9);
    const back9  = allHoles.slice(9);
    const posted = skinsField.filter(p => Object.values(holeData[`${p.id}_${shownRound}`] || {}).some(v => v > 0));
    if (posted.length === 0) return (
      <Card style={{ padding: 20, textAlign: "center", color: K.t3, fontSize: FS.small }}>No scores yet this round</Card>
    );
    const cellBdr = `1px solid ${K.bdr}${ALPHA.tint}`;
    const HalfTable = ({ holes }) => (
      <div style={{ paddingBottom: holes[0] === 0 ? 8 : 0, borderBottom: holes[0] === 0 ? `1px solid ${K.bdr}` : "none" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "20%" }} />
            {holes.map((_, i) => <col key={i} style={{ width: `${80 / holes.length}%` }} />)}
          </colgroup>
          <thead style={{ background: `${K.bdr}${ALPHA.wash}` }}>
            <tr style={{ borderBottom: cellBdr }}>
              <td style={{ fontSize: FS.micro, fontWeight: 700, color: K.t2, padding: "4px 6px", borderBottom: cellBdr }}>Hole</td>
              {holes.map(i => (
                <td key={i} style={{ textAlign: "center", fontSize: skinByHole[i] ? FS.label : FS.micro, fontWeight: skinByHole[i] ? 800 : 700, color: skinByHole[i] ? K.gold : K.t1, padding: "4px 1px", borderLeft: cellBdr }}>
                  {i + 1}
                </td>
              ))}
            </tr>
            <tr style={{ borderBottom: `1px solid ${K.bdr}${ALPHA.line}` }}>
              <td style={{ fontSize: FS.micro, fontWeight: 600, color: K.t3, padding: "3px 6px", letterSpacing: "0.03em" }}>Par</td>
              {holes.map(i => <td key={i} style={{ textAlign: "center", fontSize: FS.micro, fontWeight: 600, color: K.t3, padding: "3px 1px", borderLeft: cellBdr }}>{pars[i] || ""}</td>)}
            </tr>
          </thead>
          <tbody>
            {posted.map((p, pi) => {
              const scores = holeData[`${p.id}_${shownRound}`] || {};
              return (
                <tr key={p.id} style={{ borderTop: cellBdr, background: pi % 2 === 1 ? `${K.bdr}${ALPHA.wash}` : "transparent" }}>
                  <td style={{ fontSize: FS.label, fontWeight: 600, color: K.t1, padding: "3px 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.name.split(" ")[0]}
                  </td>
                  {holes.map(i => {
                    // The WD sentinel is a marker, not a score. Withdrawals
                    // are on this card because their money is in the pot and
                    // the holes they DID play still won skins — but the holes
                    // they did not are a dash, the way the scoring screen
                    // draws them, not a row of 99s.
                    const raw = scores[i];
                    const s = raw > 0 && raw < WD_SCORE ? raw : 0;
                    const par = pars[i] || 0;
                    const isSkinWinner = skinByHole[i]?.winner?.pid === p.id;
                    const d = s ? s - par : null;
                    const isUnder = d !== null && d < 0;
                    const isDouble = d !== null && d <= -2;
                    const circleClr = isSkinWinner ? K.gold : K.t2;
                    return (
                      <td key={i} style={{ textAlign: "center", padding: "2px 1px", borderLeft: cellBdr }}>
                        <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, position: "relative" }}>
                          {s && (isUnder || isSkinWinner) && <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `1.5px solid ${circleClr}` }} />}
                          {s && isDouble && <div style={{ position: "absolute", inset: 3, borderRadius: "50%", border: `1px solid ${circleClr}` }} />}
                          <span style={{ fontSize: FS.label, fontWeight: 600, color: s ? (isSkinWinner ? K.gold : K.t2) : K.t3, position: "relative", zIndex: 1 }}>{s || "–"}</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
    return (
      <Card pad={10}>
        <HalfTable holes={front9} />
        <HalfTable holes={back9} />
      </Card>
    );
  };

  // The round pills. The card below is always open, so these pick which round
  // it shows rather than whether there is one — and the selected pill doubles
  // as the label saying which round is on screen.
  const roundPills = (value, onChange) => (
    <SegmentedToggle
      variant="pills"
      style={{ marginBottom: 8 }}
      options={roundList.map(r => [r, `Rd ${r}`])}
      value={value}
      onChange={onChange}
    />
  );

  return (
    <div>
      {/* Pinned so this tab's lead control sits exactly where every other
          tab's does, and so the lists scroll under it rather than taking it
          away. */}
      <StickyTop>
        <SegmentedToggle
          /* The same red dot the nav tab carries, on the sub-tab that can
             actually do something about it. Getting a player as far as the
             Betting tab and then leaving them to guess which of four games
             wanted them is most of the way to not telling them at all. */
          options={[["skins", "Skins"], ["ctp", "CTP"], ["lownet", "Low Net"],
                    ["market", "Market", marketNudge ? K.danger : undefined]]}
          value={tab} onChange={setTab}
        />
      </StickyTop>

      {tab === "skins" && (
        <div>
          {potCard({
            label: "SKINS POT", pot: skinsPot, typed: true,
            summary: `${skinsField.length} IN${skinsCounted ? ` · $${sideGames.skins.amount} EACH` : ""}`,
            rightTop: `${totalSkinsWon} skin${totalSkinsWon !== 1 ? "s" : ""} won`,
            rightBottom: `${money(perSkin)} / skin`,
          })}

          {/* Net or gross. Gross is the default because it is the game WBC has
              always played here; net is what the leaderboard ranks on, and a
              field with a 20-shot spread wants to see both. */}
          <SegmentedToggle
            options={[[true, "Gross"], [false, "Net"]]}
            value={grossMode}
            onChange={pickMode}
            style={{ marginBottom: 10, width: 160, marginLeft: "auto", marginRight: "auto" }}
          />

          {/* SKINS LEADERS, with each row opening that player's own cards.
              One list rather than two: the money and the holes it was won on
              are the same question, and a second card repeating the same six
              names underneath was just a longer way to ask it. */}
          {Object.keys(skinTotals).length > 0 && (
            <div style={{ background: K.card, borderRadius: R.lg, border: `1px solid ${K.bdr}`, marginBottom: 10, overflow: "hidden" }}>
              {/* The two trailing numbers get COLUMN HEADINGS rather than
                  each row re-labelling itself. "4 skins / 3 skins / 1 skin"
                  down a column is the same word printed six times to say
                  something the heading says once — and the word was doing the
                  work of telling you which number was which, so the heading
                  frees the row to be a number. Widths match the cells below
                  so the three line up. */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${K.bdr}`, fontSize: FS.label, fontWeight: 700, color: K.gold, letterSpacing: 1 }}>
                <span style={{ flex: 1, minWidth: 0 }}>SKINS LEADERS</span>
                <span style={{ fontSize: FS.micro, color: K.t3, letterSpacing: 0.5, flexShrink: 0, width: 48, textAlign: "center" }}>COUNT</span>
                <span style={{ fontSize: FS.micro, color: K.t3, letterSpacing: 0.5, flexShrink: 0, width: 66, textAlign: "center" }}>$</span>
              </div>
              {Object.entries(skinTotals).sort((a, b) => b[1] - a[1]).map(([pid, count]) => {
                const isExpanded = expandedPlayer === pid;
                return (
                  <div key={pid} style={{ borderBottom: `1px solid ${K.bdr}${ALPHA.hair}` }}>
                    <div onClick={() => setExpandedPlayer(isExpanded ? null : pid)}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", cursor: "pointer" }}>
                      {/* The leaderboard's chevron — a ▼ that turns over
                          rather than a ▶ that swings, scaled below the type
                          scale's floor because this is an affordance and not
                          data — but LEADING the row rather than trailing the
                          name. On the board it sits after the name because
                          the name is the row; here the row is a name and two
                          numbers, and the mark belongs where the eye starts. */}
                      <span style={{ fontSize: FS.micro, flexShrink: 0, color: isExpanded ? K.acc : K.t2, transition: `transform ${MOTION}`, display: "inline-block", transform: `${isExpanded ? "rotate(180deg)" : "rotate(0)"} scale(0.75)` }}>▼</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: FS.small, fontWeight: 700, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {players.find(p => p.id === pid)?.name || pid}
                      </span>
                      <span style={{ fontSize: FS.body, fontWeight: 700, color: K.acc, flexShrink: 0, width: 48, textAlign: "center" }}>{count}</span>
                      <span style={{ fontSize: FS.small, color: K.t3, flexShrink: 0, width: 66, textAlign: "center" }}>{money(count * perSkin)}</span>
                    </div>
                    {isExpanded && renderInlineScorecard(pid)}
                  </div>
                );
              })}
            </div>
          )}

          {roundPills(shownRound, setSkinsRound)}
          {renderRoundScorecard()}
        </div>
      )}

      {tab === "ctp" && (
        <div>
          {noPar3s
            ? empty("🎯", "No par 3s yet", "Closest-to-the-pin holes come from the course. They appear here once a round has a course with a par 3 on it.")
            : (
              <>
                {/* CTP never had a hand-entered pot to preserve, so it is
                    counted from the buy-ins or it is nothing. Hidden from
                    players until there IS one — "$0.00" is not worth a row on
                    a tournament whose director has not set a CTP buy-in. The
                    director keeps it either way; it is where they set one. */}
                {(ctpPot > 0 || user?.isDirector) && potCard({
                  label: "CTP POT", pot: ctpPot,
                  summary: `${ctpField.length} IN${(sideGames?.ctp?.amount || 0) > 0 ? ` · $${sideGames.ctp.amount} EACH` : ""}`,
                  // Just the count of pins the tournament HAS, which is what
                  // the pot divides by. How many are taken and how many are
                  // final are both said better further down — on the pin
                  // itself, where a taken hole carries a name and a FINAL
                  // marker — and a running "2 of 7 taken" up here was a
                  // progress bar for something nobody is waiting on.
                  rightTop: `${par3Count} total`,
                  rightBottom: `${money(perPin)} / pin`,
                })}

                {/* CTP LEADERS, with each row opening that player's own pins.
                    NO DISTANCE ON THE ROW. It used to carry the closest shot
                    of the week beside the count, which is one number standing
                    for several — a man with four pins has four distances and
                    the row printed his best as though it described all of
                    them. The count and the money are what the row is for;
                    every distance lives one tap down, on the pin it belongs
                    to. */}
                {ctpLeaders.length > 0 && (
                  <div style={{ background: K.card, borderRadius: R.lg, border: `1px solid ${K.bdr}`, marginBottom: 10, overflow: "hidden" }}>
                    {/* The same two headings the skins card carries, at the
                        same widths, so the two leader boards in this tab read
                        as one idea rather than two layouts. */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${K.bdr}`, fontSize: FS.label, fontWeight: 700, color: K.gold, letterSpacing: 1 }}>
                      <span style={{ flex: 1, minWidth: 0 }}>CTP LEADERS</span>
                      <span style={{ fontSize: FS.micro, color: K.t3, letterSpacing: 0.5, flexShrink: 0, width: 48, textAlign: "center" }}>COUNT</span>
                      <span style={{ fontSize: FS.micro, color: K.t3, letterSpacing: 0.5, flexShrink: 0, width: 66, textAlign: "center" }}>$</span>
                    </div>
                    {ctpLeaders.map(({ pid, count }) => {
                      const isOpen = openCtpPlayer === pid;
                      const mine = ctpTags
                        .filter(t => t.playerId === pid)
                        .sort((a, b) => a.round - b.round || a.hole - b.hole);
                      return (
                        <div key={pid} style={{ borderBottom: `1px solid ${K.bdr}${ALPHA.hair}` }}>
                          <div onClick={() => setOpenCtpPlayer(isOpen ? null : pid)}
                            style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", cursor: "pointer" }}>
                            {/* Chevron first, then the name — the affordance
                                sits where the eye starts the row rather than
                                at the far end of a name it has to read past. */}
                            <span style={{ fontSize: FS.micro, flexShrink: 0, color: isOpen ? K.acc : K.t2, transition: `transform ${MOTION}`, display: "inline-block", transform: `${isOpen ? "rotate(180deg)" : "rotate(0)"} scale(0.75)` }}>▼</span>
                            <span style={{ flex: 1, minWidth: 0, fontSize: FS.small, fontWeight: 700, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {players.find(p => p.id === pid)?.name || pid}
                            </span>
                            {/* The count alone. The heading says what it is,
                                so the row does not have to say "CTPs" once
                                per line down the column. */}
                            <span style={{ fontSize: FS.body, fontWeight: 700, color: K.acc, flexShrink: 0, width: 48, textAlign: "center" }}>{count}</span>
                            <span style={{ fontSize: FS.small, color: K.t3, flexShrink: 0, width: 66, textAlign: "center" }}>{money(count * perPin)}</span>
                          </div>
                          {isOpen && (
                            <div style={{ padding: "2px 14px 8px", borderTop: `1px solid ${K.bdr}${ALPHA.tint}` }}>
                              {mine.map(t => (
                                <div key={`${t.round}_${t.hole}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                                  <span style={{ fontSize: FS.label, fontWeight: 700, color: K.t3, flexShrink: 0, minWidth: 34 }}>Rd {t.round}</span>
                                  <span style={{ fontSize: FS.label, color: K.t2, flex: 1, minWidth: 0 }}>Hole {t.hole}</span>
                                  {/* The distance, here and nowhere else. A pin
                                      tagged without one prints a dash rather
                                      than a zero — nobody paced it, which is
                                      not the same as it being on the lip. */}
                                  <span style={{ fontSize: FS.small, fontWeight: 800, color: t.distanceFt != null ? K.warn : K.t3, flexShrink: 0, minWidth: 44, textAlign: "right" }}>
                                    {t.distanceFt != null ? `${t.distanceFt} ft` : "–"}
                                  </span>
                                  {/* A pin in a round still being played can
                                      still be taken off him. */}
                                  <span style={{ fontSize: FS.micro, fontWeight: 800, letterSpacing: 0.4, flexShrink: 0, minWidth: 46, textAlign: "right", color: roundSettled(t.round) ? K.acc : K.t3 }}>
                                    {roundSettled(t.round) ? "FINAL" : "PENDING"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {roundPills(ctpShownRound, setCtpRound)}

                {(() => {
                  const { course } = roundSetup(ctpShownRound);
                  const par3s = par3sFor(ctpShownRound);
                  if (par3s.length === 0) return (
                    <Card style={{ padding: 14, textAlign: "center", color: K.t3, fontSize: FS.small }}>
                      No par 3s on {course?.name || "this course"}.
                    </Card>
                  );
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                        <SectionLabel style={{ marginBottom: 0, flex: 1 }}>{course?.name || "TBD"}</SectionLabel>
                        {/* Whether this round's pins are the answer or still
                            up for grabs. It is the same sentence the scoring
                            tab's par-3 chip prints, off the same derivation. */}
                        <span style={{ fontSize: FS.label, fontWeight: 800, letterSpacing: 0.5, color: roundSettled(ctpShownRound) ? K.acc : K.t3 }}>
                          {roundSettled(ctpShownRound) ? "ROUND FINAL" : "STILL OUT"}
                        </span>
                      </div>
                      {par3s.map(hole => {
                        const rec = (ctpData[ctpShownRound] || {})[hole];
                        const winner = rec ? players.find(p => p.id === rec.playerId) : null;
                        const dist = rec ? (rec.distanceFt ? `${rec.distanceFt} ft` : (rec.distance || "")) : "";
                        const isEd = editCtpHole === hole;
                        const settled = roundSettled(ctpShownRound);
                        const confirmers = (rec?.confirmedBy || [])
                          .map(pid => players.find(p => p.id === pid)?.name)
                          .filter(Boolean);
                        return (
                          <Card key={hole} style={{ border: `1px solid ${winner ? K.acc + ALPHA.line : K.bdr}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                              <div>
                                <span style={{ fontSize: FS.body, fontWeight: 700 }}>Hole {hole}</span>
                                <span style={{ fontSize: FS.small, color: K.t3, marginLeft: 8 }}>Par 3</span>
                              </div>
                              {winner ? (
                                <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                                  <span style={{ fontSize: FS.body, fontWeight: 700, color: K.acc, whiteSpace: "nowrap" }}>🎯 {winner.name}</span>
                                  {dist && <span style={{ fontSize: FS.small, fontWeight: 800, color: K.warn }}>{dist}</span>}
                                </span>
                              ) : <span style={{ fontSize: FS.small, color: K.t3 }}>No winner yet</span>}
                            </div>

                            {/* The pin's standing. A tagged hole in a live
                                round is what the field has SO FAR — a group
                                still out can get inside it — so saying FINAL
                                only once the round is done is the difference
                                between a result and a running total. */}
                            {winner && (
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                                <span style={{
                                  fontSize: FS.micro, fontWeight: 800, letterSpacing: 0.5,
                                  padding: "2px 6px", borderRadius: R.xs,
                                  color: settled ? K.acc : K.t3,
                                  border: `1px solid ${settled ? K.acc + ALPHA.line : K.bdr}`,
                                }}>{settled ? "FINAL" : "PENDING"}</span>
                                {/* Groups that walked off, saw this tag and let
                                    it stand — the on-course prompt's other
                                    answer. It is how a director tells a pin
                                    nobody has been asked about apart from one
                                    the field has agreed on. */}
                                {confirmers.length > 0 && (
                                  <span style={{ fontSize: FS.label, color: K.t3, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    Confirmed by {confirmers.join(", ")}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* A tag naming somebody who is not in the CTP game
                                still shows — the document is the hole's answer —
                                but it wins no money, and saying so here is
                                cheaper than a director wondering why the board
                                disagrees with the hole. */}
                            {rec?.playerId && !ctpInSet.has(rec.playerId) && (
                              <div style={{ fontSize: FS.label, color: K.warn, marginTop: 4 }}>Not in the CTP game — this pin pays nothing</div>
                            )}

                            {/* Tagged-by line — CTP is claimed on-course by whichever group was closest,
                                so it's worth showing who recorded it when a director is reconciling. */}
                            {rec?.taggedByName && !isEd && (
                              <div style={{ fontSize: FS.label, color: K.t3, marginTop: 4 }}>Tagged by {rec.taggedByName}</div>
                            )}

                            {/* Director override — available whether or not a tag exists. This is the
                                correction path for a mis-tagged winner or a mis-scrolled distance. */}
                            {user.isDirector && !isEd && (
                              <Btn variant="secondary" size="sm" block style={{ marginTop: 10 }}
                                onClick={() => { setEditCtpHole(hole); setEditCtpPlayer(rec?.playerId || ""); setEditCtpFeet(rec?.distanceFt ? String(rec.distanceFt) : ""); }}
                              >{winner ? "Edit CTP" : "Set CTP winner"}</Btn>
                            )}
                            {user.isDirector && isEd && settled && (
                              <div style={{ fontSize: FS.label, color: K.warn, marginTop: 8, lineHeight: 1.5 }}>
                                Round {ctpShownRound} is finalized — this pin is settled. Changing it moves money that has already been called.
                              </div>
                            )}
                            {user.isDirector && isEd && (
                              <div style={{ marginTop: 10 }}>
                                {/* Only players who bought into CTP are offered. A hole
                                    already tagged to somebody since taken out still shows
                                    their name above — that is what the document says — but
                                    they cannot be picked again. */}
                                <select value={editCtpPlayer} onChange={e => setEditCtpPlayer(e.target.value)} style={{ width: "100%", padding: "8px 12px", background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: R.sm, color: K.t1, fontSize: FS.small, marginBottom: 6 }}>
                                  <option value="">Select CTP winner...</option>
                                  {ctpField.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                <input
                                  type="number" inputMode="numeric" min="1" max={CTP_MAX_FT}
                                  placeholder="Distance (ft)"
                                  value={editCtpFeet}
                                  onChange={e => setEditCtpFeet(e.target.value)}
                                  style={{ width: "100%", padding: "8px 12px", background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: R.sm, color: K.t1, fontSize: FS.small, marginBottom: 8, boxSizing: "border-box" }}
                                />
                                <div style={{ display: "flex", gap: 6 }}>
                                  <Btn size="sm" block disabled={!editCtpPlayer}
                                    onClick={async () => {
                                      if (!editCtpPlayer) return;
                                      const ft = editCtpFeet === "" ? null : Math.max(1, Math.min(CTP_MAX_FT, parseInt(editCtpFeet, 10) || 0)) || null;
                                      await onSetCtp(ctpShownRound, hole, editCtpPlayer, ft);
                                      setEditCtpHole(null);
                                    }}
                                  >Save</Btn>
                                  <Btn variant="secondary" size="sm" block onClick={() => setEditCtpHole(null)}>Cancel</Btn>
                                </div>
                              </div>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  );
                })()}
              </>
            )}
        </div>
      )}

      {tab === "lownet" && (
        <div>
          {potCard({
            label: "LOW NET POT", pot: lowNetPot,
            summary: `${lowNetField.length} IN${(sideGames?.lownet?.amount || 0) > 0 ? ` · $${sideGames.lownet.amount} EACH` : ""}`,
            rightTop: `${roundList.length} round${roundList.length !== 1 ? "s" : ""}`,
            rightBottom: `${money(lowNetPerRound)} / round`,
          })}

          {/* Every round on one screen rather than behind pills: there are
              four of them, each is one line, and the question this tab
              answers — who took which day — is a comparison across them.

              A LEDGER, not a list. Gross, strokes and net each get a column
              and line up down the page, which is what turns "who won Rd 2"
              into "Rd 2 was tied off a 78 and an 85" without anybody doing
              arithmetic. The old row stacked those three numbers into a grey
              sub-line under the name, where they could not be compared with
              the round above.

              A tie is simply a second row under the same round number,
              carrying that man's OWN gross and strokes — two players tie on
              the net off different cards, so the single "2 tied on 71 net"
              the old row printed was true of the pair and a lie about each
              of them. */}
          <div style={{ background: K.card, borderRadius: R.lg, border: `1px solid ${K.bdr}`, overflow: "hidden" }}>
            <div style={{ display: "flex", padding: "8px 14px", borderBottom: `1px solid ${K.bdr}`, fontSize: FS.label, fontWeight: 700, color: K.gold, letterSpacing: 1 }}>
              <span style={{ flex: 1 }}>BY ROUND</span>
              <span style={{ color: K.t3 }}>{lowNetRows.filter(r => r.decided).length} OF {roundList.length}</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                {/* The four score columns are held at near-equal widths so
                    the block of numbers reads as a block. WINNER takes the
                    slack; PAYS is the widest because "$15.63" is the longest
                    string on the row. */}
                <col style={{ width: 34 }} />
                <col />
                <col style={{ width: 36 }} />
                <col style={{ width: 32 }} />
                <col style={{ width: 34 }} />
                <col style={{ width: 32 }} />
                <col style={{ width: 54 }} />
              </colgroup>
              <thead>
                <tr style={{ background: `${K.bdr}${ALPHA.wash}` }}>
                  {[["RD", "left"], ["WINNER", "left"], ["Gross", "right"], ["CH", "right"], ["NET", "right"], ["±", "right"], ["PAYS", "right"]].map(([label, align], i, all) => (
                    <th key={label} style={{
                      textAlign: align, fontSize: FS.micro, fontWeight: 700, letterSpacing: 0.5, color: K.t3,
                      padding: "5px 4px", borderBottom: `1px solid ${K.bdr}${ALPHA.line}`,
                      paddingLeft: i === 0 ? 10 : 4, paddingRight: i === all.length - 1 ? 12 : 4,
                    }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lowNetRows.map((r, ri) => {
                  const settled = roundSettled(r.round);
                  const share = r.winners.length > 0 ? lowNetPerRound / r.winners.length : 0;
                  const courseName = roundSetup(r.round).course?.name || "";
                  const open = openNetRound === r.round;
                  const toggle = () => setOpenNetRound(open ? null : r.round);
                  // Banded by ROUND rather than by row, so a tie's two lines
                  // read as one day rather than as two separate results.
                  const band = ri % 2 === 1 ? `${K.bdr}${ALPHA.wash}` : "transparent";
                  const cell = (extra = {}) => ({
                    padding: "7px 4px", textAlign: "right", fontSize: FS.small, fontWeight: 600,
                    color: K.t2, borderTop: `1px solid ${K.bdr}${ALPHA.hair}`, ...extra,
                  });
                  // ── The round's own header strip ──
                  // Round, chevron and COURSE, on a line of their own above
                  // the winner. The course used to sit under the winner's
                  // name, which read as though it belonged to him rather than
                  // to the day — and on a tie it could only be printed under
                  // one of the two men who played it.
                  const headerRow = (
                    <tr key={`${r.round}_h`} onClick={toggle} style={{ background: `${K.bdr}${ALPHA.wash}`, cursor: "pointer" }}>
                      <td style={cell({ textAlign: "left", paddingLeft: 10, padding: "5px 4px 5px 10px" })}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                          <span style={{ fontSize: FS.label, fontWeight: 800, color: open ? K.acc : K.t3 }}>{r.round}</span>
                          {/* The leaderboard's chevron, same as everywhere. */}
                          <span style={{ fontSize: FS.micro, flexShrink: 0, color: open ? K.acc : K.t2, transition: `transform ${MOTION}`, display: "inline-block", transform: `${open ? "rotate(180deg)" : "rotate(0)"} scale(0.75)` }}>▼</span>
                        </span>
                      </td>
                      <td colSpan={6} style={cell({ textAlign: "left", padding: "5px 12px 5px 4px", fontSize: FS.micro, fontWeight: 700, letterSpacing: 0.4, color: K.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })}>
                        {courseName || "No course set"}
                      </td>
                    </tr>
                  );
                  // The whole field for the day, lowest net first. It answers
                  // the question the winner's name provokes — by how much —
                  // and on a round still being played it is the only thing
                  // this tab can say at all.
                  // The rest of the field, starting at second. The winners
                  // are already printed above in full, so repeating them at
                  // the head of the list was the same two lines twice — the
                  // question this opens is who ELSE was out there.
                  const fieldRows = !open ? [] : lowNetRoundField({ players: lowNetField, round: r.round, lineFor })
                    .filter(f => !r.winners.some(w => w.pid === f.pid))
                    .map(f => {
                    const sub = (extra = {}) => cell({
                      fontSize: FS.label, borderTop: "none", color: K.t3,
                      background: `${K.bdr}${ALPHA.wash}`, padding: "5px 4px", ...extra,
                    });
                    return (
                      <tr key={`${r.round}_f_${f.pid}`}>
                        <td style={sub({ paddingLeft: 10 })} />
                        <td style={sub({ textAlign: "left", color: K.t2, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })}>
                          {f.name}
                        </td>
                        <td style={sub()}>{f.gross}</td>
                        <td style={sub()}>{f.strokes}</td>
                        {/* A card still out has a gross and no round. Printing
                            its net would rank a man on the 14th against men
                            who have signed — the same thing lowNetRounds
                            refuses to do. */}
                        <td style={sub({ color: f.complete ? (f.net < 0 ? K.under : K.t2) : K.t3, fontWeight: 700 })}>
                          {f.complete ? f.netScore : "–"}
                        </td>
                        {/* A card still out takes BOTH trailing cells for its
                            standing. "THRU 16" does not fit the PAYS column
                            alone and wrapped onto two lines; the ± beside it
                            is empty on these rows anyway. */}
                        {f.complete ? (
                          <>
                            <td style={sub({ color: f.net < 0 ? K.under : K.t3, fontWeight: 700 })}>{fmtPar(f.net)}</td>
                            <td style={sub({ paddingRight: 12 })} />
                          </>
                        ) : (
                          <td colSpan={2} style={sub({ paddingRight: 12, fontSize: FS.micro, fontWeight: 700, letterSpacing: 0.3, whiteSpace: "nowrap" })}>
                            {f.wd ? "WD" : `THRU ${f.thru}`}
                          </td>
                        )}
                      </tr>
                    );
                  });
                  // A day the whole field tied, or one only the winner
                  // finished, opens onto nothing — which looks broken rather
                  // than empty unless it says so.
                  if (open && fieldRows.length === 0) fieldRows.push(
                    <tr key={`${r.round}_f_none`}>
                      <td style={cell({ paddingLeft: 10, borderTop: "none", background: `${K.bdr}${ALPHA.wash}`, padding: "5px 4px 5px 10px" })} />
                      <td colSpan={6} style={cell({ textAlign: "left", borderTop: "none", background: `${K.bdr}${ALPHA.wash}`, padding: "5px 12px 5px 4px", fontSize: FS.label, color: K.t3 })}>
                        Nobody else has posted
                      </td>
                    </tr>,
                  );

                  if (!r.decided) return [
                    headerRow,
                    <tr key={r.round} style={{ background: band }}>
                      <td style={cell({ paddingLeft: 10 })} />
                      <td colSpan={6} onClick={toggle} style={cell({ textAlign: "left", color: K.t3, paddingRight: 12, cursor: "pointer" })}>
                        {(() => {
                          const tee = teeWindowFor(r.round);
                          if (tee) return (
                            <>
                              <span style={{ fontSize: FS.micro, fontWeight: 800, letterSpacing: 0.5, color: K.t3 }}>TEE </span>
                              <span style={{ color: K.t2, fontWeight: 700 }}>{tee}</span>
                            </>
                          );
                          // No sheet drawn yet, so there is nothing to say
                          // except that the day is still empty.
                          return roundSetup(r.round).course ? "Nobody has finished yet" : "No scores yet";
                        })()}
                      </td>
                    </tr>,
                    ...fieldRows,
                  ];

                  return [
                    headerRow,
                    ...r.winners.map((w, wi) => (
                      <tr key={`${r.round}_${w.pid}`} style={{ background: band }}>
                        {/* The round number lives on the header strip above,
                            so the winner rows start at the name — and a tie's
                            two lines are simply two names under one day. */}
                        <td style={cell({ paddingLeft: 10, borderTop: wi > 0 ? "none" : undefined })} />
                        <td onClick={toggle} style={cell({ textAlign: "left", fontSize: FS.small, fontWeight: 700, color: K.t1, borderTop: wi > 0 ? "none" : undefined, cursor: "pointer", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })}>
                          {w.name}
                        </td>
                        <td style={cell({ borderTop: wi > 0 ? "none" : undefined })}>{w.gross}</td>
                        <td style={cell({ borderTop: wi > 0 ? "none" : undefined })}>{w.strokes}</td>
                        {/* The net as a SCORE — how a low net gets read out in
                            a car park — and the to-par beside it. BOTH take the
                            under-par red: a 67 on a par 72 is a number under
                            par whether it is written as 67 or as −5, and
                            colouring only one of them made the pair look like
                            two different facts. */}
                        <td style={cell({ fontSize: FS.body, fontWeight: 800, color: w.net < 0 ? K.under : K.t1, borderTop: wi > 0 ? "none" : undefined })}>{w.netScore}</td>
                        <td style={cell({ fontWeight: 800, color: w.net < 0 ? K.under : K.t1, borderTop: wi > 0 ? "none" : undefined })}>{fmtPar(w.net)}</td>
                        {/* A day still being played can change hands as the
                            last group comes in, so the money is held rather
                            than printed as though it had been paid. */}
                        <td style={cell({ paddingRight: 12, borderTop: wi > 0 ? "none" : undefined })}>
                          {settled
                            ? money(share)
                            : <span style={{ fontSize: FS.micro, fontWeight: 800, letterSpacing: 0.5, color: K.warn }}>OUT</span>}
                        </td>
                      </tr>
                    )),
                    ...fieldRows,
                  ];
                })}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {tab === "market" && (
        <div>
          {potCard({
            label: "MARKET POT", pot: marketPot,
            // Two buy-ins in one pot, but the second count only appears once
            // it is FINAL. While the halfway window is open "3 rebuying" is a
            // running total that moves every time somebody taps, and a player
            // reading it as the field's verdict is reading a number that is
            // still being written. Shut, it is a fact: this many rebought.
            summary: `${marketField.length} IN${windows.mid.closed ? ` · ${rebuyField.length} REBUYS` : ""}`,
            rightTop: `${board.reduce((a, b) => a + b.shares, 0)} share${board.reduce((a, b) => a + b.shares, 0) !== 1 ? "s" : ""} placed`,
            rightBottom: `${holders.length} holder${holders.length !== 1 ? "s" : ""}`,
          })}

          {/* ── The director's shares worklist ── */}
          {/* Its own drawer, and the only place that lists a player who has
              placed NOTHING. The holders list below only knows about people
              who have already bet, which made the man who handed his picks
              over on paper invisible on the screen meant to chase him. */}
          {user?.isDirector && (
            <>
              <div
                onClick={() => setShowRoster(v => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                  background: K.card, borderRadius: R.lg, border: `1px solid ${K.bdr}`,
                  padding: "10px 14px", marginBottom: showRoster ? 0 : 10,
                }}
              >
                <span style={{ flex: 1, fontSize: FS.label, fontWeight: 700, color: K.t3, letterSpacing: 0.6 }}>
                  {roster.rows.length - roster.outstanding} OF {roster.rows.length} HAVE WAGERED
                  {roster.outstanding > 0 ? ` · ${roster.outstanding} PENDING` : ""}
                </span>
                <span style={{ fontSize: FS.label, fontWeight: 700, color: K.acc, letterSpacing: 0.6 }}>
                  SHARES {showRoster ? "▾" : "▸"}
                </span>
              </div>

              {showRoster && (
                <div style={{ background: K.card, border: `1px solid ${K.acc}${ALPHA.line}`, borderRadius: R.sm, marginBottom: 10, overflow: "hidden" }}>
                  <div style={{ padding: "8px 12px", fontSize: FS.label, color: K.t3, lineHeight: 1.4, borderBottom: `1px solid ${K.bdr}` }}>
                    Tap a name to enter or change their shares. Counts only — what they
                    are holding stays in their book.
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 56px 56px", gap: 2, padding: "6px 12px", borderBottom: `1px solid ${K.bdr}` }}>
                    <span style={{ fontSize: FS.label, fontWeight: 700, color: K.t3, letterSpacing: 0.5 }}>PLAYER</span>
                    <span style={{ fontSize: FS.micro, fontWeight: 800, color: K.t2, textAlign: "center" }}>OPEN</span>
                    <span style={{ fontSize: FS.micro, fontWeight: 800, color: K.t2, textAlign: "center" }}>HALF</span>
                  </div>
                  {roster.rows.map(r => {
                    const openFull = r.opening >= MARKET_OPENING_SHARES;
                    const midAny = r.mid > 0;
                    const cell = (n, full, tone) => (
                      <span style={{ textAlign: "center", fontSize: FS.small, fontWeight: 800, color: tone ? (full ? K.acc : K.warn) : K.t3 }}>
                        {n > 0 ? n : "–"}
                      </span>
                    );
                    return (
                      <div key={r.pid}
                        onClick={() => openBook(r.pid)}
                        style={{
                          display: "grid", gridTemplateColumns: "minmax(0,1fr) 56px 56px", gap: 2,
                          alignItems: "center", padding: "8px 12px", cursor: "pointer",
                          borderBottom: `1px solid ${K.bdr}${ALPHA.hair}`,
                          background: r.placed === 0 ? K.warn + ALPHA.wash : "transparent",
                        }}>
                        <span style={{ minWidth: 0, fontSize: FS.small, fontWeight: 600, color: r.placed > 0 ? K.t1 : K.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.name}
                        </span>
                        {cell(r.opening, openFull, r.opening > 0)}
                        {cell(r.mid, r.mid >= MARKET_MID_SHARES, midAny)}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {/* ── Your book ── */}
          {!bookPid ? null : !marketInSet.has(bookPid) ? (
            <Card style={{ marginBottom: 10, color: K.t3, fontSize: FS.small }}>
              {bookPid === myPid ? "You are not in the market game." : "That player is not in the market game."}
            </Card>
          ) : (
            <Card style={{ marginBottom: 10 }} ref={bookRef}>
              {/* NO TITLE ROW. A player has exactly one book and cannot look
                  at anybody else's, so "Your book" named the only thing it
                  could have been — and "4 of 20 left" is "16/20" on the
                  window tab said from the other end. The card starts on the
                  shares. A director gets a heading back below, because they
                  really can be looking at somebody else's. */}
              {/* The director places for somebody else — the path for the phone
                  that died before the bell, and the only way a shut window can
                  still be written to. */}
              {user?.isDirector && (
                <>
                  <select
                    value={bookPid}
                    onChange={e => openBook(e.target.value, bookWindow)}
                    style={{ width: "100%", padding: "8px 12px", background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: R.sm, color: K.t1, fontSize: FS.small, marginBottom: 8 }}
                  >
                    {marketField.map(p => <option key={p.id} value={p.id}>{p.name}{p.id === myPid ? " (you)" : ""}</option>)}
                  </select>
                  {/* A director editing somebody else's bet is a real act with
                      real money behind it, so the screen says whose book is
                      open rather than letting a changed dropdown be the only
                      sign of it. */}
                  {bookPid !== myPid && (
                    <div style={{ fontSize: FS.label, color: K.warn, marginBottom: 8, lineHeight: 1.5 }}>
                      Editing {players.find(p => p.id === bookPid)?.name || bookPid}&apos;s shares as director.
                    </div>
                  )}
                  {/* And placing into a window the field can no longer touch is
                      a second thing again — worth saying out loud, because it
                      is the one edit nobody else could have made. */}
                  {!win.open && (
                    <div style={{ fontSize: FS.label, color: K.warn, marginBottom: 8, lineHeight: 1.5 }}>
                      This window is shut to the field. You are placing on the director&apos;s override.
                    </div>
                  )}
                </>
              )}

              {/* Both windows close on a tee time now, so both can be counted
                  down to — a player looking at the halfway tab in the car park
                  after round two needs the same answer the opening tab gave
                  him on Friday. */}
              {finalSheet ? (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                    <SectionLabel style={{ marginBottom: 0, flex: 1 }}>Your wagers</SectionLabel>
                    <span style={{ fontSize: FS.label, fontWeight: 700, color: K.t3 }}>
                      {totalShares(allLots(bookBet))} share{totalShares(allLots(bookBet)) !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {allLots(bookBet).length === 0 ? (
                    <div style={{ fontSize: FS.small, color: K.t3, lineHeight: 1.5 }}>
                      You did not place any shares. Both windows are closed.
                    </div>
                  ) : allLots(bookBet).map(l => {
                    const openN = sharesOn(lotsFor(bookBet, "opening"), l.pid);
                    const midN = sharesOn(lotsFor(bookBet, "mid"), l.pid);
                    return (
                      <div key={l.pid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: `1px solid ${K.bdr}${ALPHA.hair}` }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: FS.small, fontWeight: 700, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {players.find(p => p.id === l.pid)?.name || l.pid}
                        </span>
                        {/* The split, quietly, for anybody working out which
                            of the two calls this holding came from. It only
                            appears when the halfway ten actually went in. */}
                        {midN > 0 && (
                          <span style={{ flexShrink: 0, fontSize: FS.micro, fontWeight: 700, color: K.t3, letterSpacing: 0.3 }}>
                            {openN} + {midN}
                          </span>
                        )}
                        <span style={{ flexShrink: 0, width: 42, textAlign: "right", fontSize: FS.lead, fontWeight: 800, color: K.acc }}>{l.shares}</span>
                      </div>
                    );
                  })}
                </>
              ) : (<>
              {windows.mid.exists !== false && (
                <SegmentedToggle
                  compact
                  style={{ marginBottom: 4 }}
                  options={[["opening", `${windows.opening.label} · ${totalShares(lotsFor(bookBet, "opening"))}/${MARKET_OPENING_SHARES}`],
                            ["mid", `${windows.mid.label} · ${totalShares(lotsFor(bookBet, "mid"))}/${MARKET_MID_SHARES}`]]}
                  value={activeWindow}
                  onChange={k => { setBookWindow(k); setDraft(null); }}
                />
              )}

              {/* The two clocks sit UNDER the switch rather than inside it —
                  a tab is a control and a countdown is a readout, and packing
                  one into the other made the pill two lines tall for the sake
                  of a number that changes on its own. Each cell is half the
                  width so it lands under the tab it belongs to.
                  The tone escalates green → amber on the day of the tee time
                  → red inside the last hour; see lib/market countdownTone.
                  A window that has not opened yet prints NOTHING. "Not yet"
                  is the tab's own share count saying 0/10 already. */}
              {windows.mid.exists !== false && (openingClock || midClock || windows.opening.closed) && (
                <div style={{ display: "flex", marginBottom: 6 }}>
                  {[[windows.opening, openingClock], [windows.mid, midClock]].map(([w, clock]) => (
                    <span key={w.key} style={{
                      flex: 1, textAlign: "center",
                      fontSize: FS.label, fontWeight: 800, letterSpacing: 0.4,
                      fontVariantNumeric: "tabular-nums",
                      color: clock ? toneFor(w) : K.t3,
                    }}>{clock ? clock.label : w.closed ? "CLOSED" : ""}</span>
                  ))}
                </div>
              )}

              {/* What the second window costs, said before the first tap
                  rather than after. Nothing is prepaid here: placing a share
                  IS taking on the rebuy, so a player who has placed none is
                  being warned and a player who has placed some is being told
                  what they already owe. */}
              {activeWindow === "mid" && canPlace && rebuyAmount > 0 && (
                <div style={{
                  fontSize: FS.label, marginBottom: 8, lineHeight: 1.5, padding: "6px 10px",
                  borderRadius: R.sm, border: `1px solid ${owesRebuy ? K.acc : K.warn}${ALPHA.line}`,
                  color: owesRebuy ? K.acc : K.warn,
                }}>
                  {owesRebuy
                    ? `In for the $${rebuyAmount} rebuy — settle up with the director. Taking every share back off drops it.`
                    : `Placing any of these ${MARKET_MID_SHARES} puts ${bookPid === myPid ? "you" : "them"} in for the $${rebuyAmount} rebuy. Pay the director after.`}
                </div>
              )}

              {/* ── Who is on the sheet ──
                  An OPEN window lists the whole field, because any of them
                  can still be backed. A SHUT one lists only the golfers you
                  actually wagered on — the book as it stands, with the
                  fourteen names you passed over taken out of the way.
                  That is the sheet a player wants in front of him at the turn
                  while he decides where the halfway ten should go, and it is
                  the whole of what he owns once both windows have run.
                  Directors keep the full list on the override, because
                  entering a phone that died before the bell means entering a
                  name that is not on the sheet yet. */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                {!canPlace && players.every(p => sharesOn(draftLots, p.id) === 0) && (
                  /* A shut window with nothing in it has no rows and, since
                     the note line came out, nothing else either — so it says
                     what happened rather than rendering an empty card. */
                  <div style={{ fontSize: FS.label, color: K.t3, padding: "4px 0 2px", lineHeight: 1.5 }}>
                    {win.closed ? "Nothing wagered in this window." : win.note}
                  </div>
                )}
                {(canPlace ? players : players.filter(p => sharesOn(draftLots, p.id) > 0)).map(p => {
                  const n = sharesOn(draftLots, p.id);
                  return (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${K.bdr}${ALPHA.hair}` }}>
                      {/* The name alone. It used to carry a "· 4 held" tail
                          repeating what the accent number beside it already
                          says, and the name brightening from t3 to t1 is the
                          same fact a third time. */}
                      <span style={{ flex: 1, minWidth: 0, fontSize: FS.small, fontWeight: 600, color: n > 0 ? K.t1 : K.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.name}
                      </span>
                      {/* A SHUT window is a receipt, not a control. The
                          steppers were rendered disabled, which is four grey
                          boxes per row saying "you cannot" to somebody who is
                          only reading. */}
                      {canPlace ? (
                        <>
                          <Btn variant="secondary" size="sm" disabled={n <= 0}
                            style={{ padding: "3px 10px", minWidth: 32 }}
                            onClick={() => bump(p.id, -1)}>−</Btn>
                          {/* The number is a FIELD, not a readout. Twenty shares
                              is twenty taps on a stepper, and a director entering
                              the field's picks off a sheet of paper does that
                              sixteen times over. Typing 12 is one action.
                              Capped through the same setLotShares the steppers
                              use, so a window still cannot be overspent however
                              the number got there. FS.lead because this is a real
                              input and anything under 16px makes iOS zoom the
                              page on focus and never zoom back. */}
                          <input
                            type="number" inputMode="numeric" min="0" max={win.shares}
                            value={n === 0 ? "" : String(n)} placeholder="0"
                            onChange={e => setShares(p.id, e.target.value === "" ? 0 : parseInt(e.target.value, 10) || 0)}
                            onFocus={e => e.currentTarget.select()}
                            style={{
                              width: 38, textAlign: "center", fontSize: FS.lead, fontWeight: 800,
                              color: n > 0 ? K.acc : K.t3, background: "transparent",
                              border: "none", borderBottom: `1px solid ${K.bdr}`,
                              outline: "none", fontFamily: FONT, padding: 0,
                            }}
                          />
                          <Btn variant="secondary" size="sm" disabled={remaining <= 0}
                            style={{ padding: "3px 10px", minWidth: 32 }}
                            onClick={() => bump(p.id, 1)}>+</Btn>
                          {/* Five at a time. Twenty shares in fives is four taps
                              where the single stepper wanted twenty, and 5/10/15/20
                              is how the field actually talks about a book. It
                              clamps through the same setLotShares as everything
                              else, so tapping it with three left adds three. */}
                          <Btn variant="secondary" size="sm" disabled={remaining <= 0}
                            style={{ padding: "3px 8px", minWidth: 32 }}
                            onClick={() => bump(p.id, 5)}>+5</Btn>
                        </>
                      ) : (
                        <span style={{ flexShrink: 0, width: 42, textAlign: "right", fontSize: FS.lead, fontWeight: 800, color: K.acc }}>{n}</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {canPlace && (
                <div style={{ marginTop: 10 }}>
                  <Btn block disabled={!dirty} onClick={commitBook}>{dirty ? "Wager shares" : "Wagered"}</Btn>
                  {/* The two ways back, under the commit rather than beside
                      it: three block buttons do not fit a phone, and these
                      are the undo pair, not alternatives to saving.
                      Clear beats taking twenty shares off one at a time,
                      which is what re-entering a misheard book meant. */}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <Btn variant="secondary" size="sm" block disabled={!dirty} onClick={() => setDraft(null)}>Reset</Btn>
                    <Btn variant="secondary" size="sm" block disabled={placed === 0} onClick={clearWindow}>Clear window</Btn>
                  </div>
                </div>
              )}
              </>)}
            </Card>
          )}

          {/* ── The market ── */}
          {board.length === 0
            ? empty("📈", "Nothing placed yet", `Everybody in gets ${MARKET_OPENING_SHARES} shares before the tournament starts, and ${MARKET_MID_SHARES} more once the halfway round is in. The pot splits between whoever is holding the winner.`)
            : sealed ? (
              // What is safe to show through the seal: how big the market is,
              // never how it is positioned. A player can see that the field
              // has bet, and their own book above it, and nothing else.
              <Card style={{ marginBottom: 10, textAlign: "center", padding: "28px 20px" }}>
                <div style={{ fontSize: FS.display, marginBottom: 10, opacity: 0.5 }}>🔒</div>
                <div style={{ fontSize: FS.lead, fontWeight: 700, color: K.t1, marginBottom: 6 }}>The book is sealed</div>
                <div style={{ fontSize: FS.small, color: K.t3, maxWidth: 300, lineHeight: 1.5, margin: "0 auto" }}>
                  {board.reduce((a, b) => a + b.shares, 0)} shares are placed across {holders.length} {holders.length === 1 ? "player" : "players"}.
                  Who is holding whom opens when the tournament is over — betting blind is the game.
                </div>
              </Card>
            ) : (
              <div style={{ background: K.card, borderRadius: R.lg, border: `1px solid ${K.bdr}`, marginBottom: 10, overflow: "hidden" }}>
                <div style={{ display: "flex", padding: "8px 14px", borderBottom: `1px solid ${K.bdr}`, fontSize: FS.label, fontWeight: 700, color: K.gold, letterSpacing: 1 }}>
                  <span style={{ flex: 1 }}>THE MARKET</span>
                  {!eventComplete && <span style={{ color: K.warn, marginRight: 8 }}>🔒 SEALED</span>}
                  <span style={{ color: K.t3 }}>SHARES · IF THEY WIN</span>
                </div>
                {board.map(r => {
                  const isLeader = r.pid === winnerId;
                  return (
                    <div key={r.pid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${K.bdr}${ALPHA.hair}`, background: isLeader ? K.accGlow : "transparent" }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: FS.body, fontWeight: 600, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {isLeader && <span style={{ color: K.gold }}>🏆 </span>}{r.name}
                      </span>
                      {/* The share of the market, as a bar rather than a second
                          number — this is the one thing on the screen that is
                          easier to read as a length than as a percentage. */}
                      <span style={{ width: 44, height: 4, borderRadius: R.xs, background: `${K.bdr}`, overflow: "hidden", flexShrink: 0 }}>
                        <span style={{ display: "block", width: `${Math.round(r.pct)}%`, height: "100%", background: K.acc }} />
                      </span>
                      <span style={{ fontSize: FS.body, fontWeight: 800, color: K.acc, width: 28, textAlign: "right", flexShrink: 0 }}>{r.shares}</span>
                      <span style={{ fontSize: FS.small, color: K.t3, width: 56, textAlign: "right", flexShrink: 0 }}>{money(r.perShare)}</span>
                    </div>
                  );
                })}
              </div>
            )}

          {/* ── The payout ── */}
          {/* Names and share counts, so it is sealed on the same terms as the
              board — a standing payout is the board read backwards. */}
          {winnerId && board.length > 0 && !sealed && (
            <div style={{ background: K.card, borderRadius: R.lg, border: `1px solid ${eventComplete ? K.gold + ALPHA.line : K.bdr}`, marginBottom: 10, overflow: "hidden" }}>
              <div style={{ padding: "8px 14px", borderBottom: `1px solid ${K.bdr}`, fontSize: FS.label, fontWeight: 700, color: K.gold, letterSpacing: 1 }}>
                {eventComplete ? "PAYOUT" : "IF IT ENDED NOW"}
              </div>
              <div style={{ padding: "8px 14px", fontSize: FS.small, color: K.t3, borderBottom: `1px solid ${K.bdr}${ALPHA.hair}` }}>
                {leader?.name} · {payouts.totalShares} share{payouts.totalShares !== 1 ? "s" : ""} held
                {payouts.totalShares > 0 ? ` · ${money(payouts.perShare)} each` : ""}
              </div>
              {payouts.unclaimed ? (
                <div style={{ padding: "12px 14px", fontSize: FS.small, color: K.warn, lineHeight: 1.5 }}>
                  Nobody is holding {leader?.name}. The {money(marketPot)} pot has no claimant — that is a conversation for the room, not something the app should decide.
                </div>
              ) : payouts.rows.map(r => (
                <div key={r.pid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${K.bdr}${ALPHA.hair}` }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: FS.body, fontWeight: 600, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {players.find(p => p.id === r.pid)?.name || r.pid}
                  </span>
                  <span style={{ fontSize: FS.body, fontWeight: 700, color: K.acc, flexShrink: 0 }}>{r.shares} sh</span>
                  <span style={{ fontSize: FS.small, fontWeight: 700, color: K.gold, width: 64, textAlign: "right", flexShrink: 0 }}>{money(r.payout)}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Who is holding what ── */}
          {holders.length > 0 && !sealed && (
            <Card style={{ marginBottom: 10 }}>
              <SectionLabel style={{ marginBottom: 8 }}>Holders</SectionLabel>
              {holders.map(h => {
                const isOpen = openHolder === h.pid;
                return (
                  <div key={h.pid} style={{ borderBottom: `1px solid ${K.bdr}${ALPHA.wash}` }}>
                    <div onClick={() => setOpenHolder(isOpen ? null : h.pid)}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 4px", cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <span style={{ fontWeight: 600, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
                        <span style={{ fontSize: FS.micro, flexShrink: 0, color: isOpen ? K.acc : K.t2, transition: `transform ${MOTION}`, display: "inline-block", transform: `${isOpen ? "rotate(180deg)" : "rotate(0)"} scale(0.75)` }}>▼</span>
                      </div>
                      <span style={{ color: K.acc, fontWeight: 800, flexShrink: 0 }}>{h.shares} sh</span>
                    </div>
                    {isOpen && (
                      <div style={{ padding: "0 4px 8px 20px" }}>
                        {h.lots.map(l => (
                          <div key={l.pid} style={{ display: "flex", justifyContent: "space-between", fontSize: FS.small, color: K.t2, padding: "3px 0" }}>
                            <span>{players.find(p => p.id === l.pid)?.name || l.pid}</span>
                            <span style={{ fontWeight: 700, color: K.t1 }}>{l.shares}</span>
                          </div>
                        ))}
                        {/* The correction path, at the point the mistake is
                            spotted. Reading a wrong allocation and then having
                            to scroll back up and find the name in a dropdown
                            is how the wrong man gets edited. */}
                        {user?.isDirector && (
                          <Btn variant="secondary" size="sm" style={{ marginTop: 6 }}
                            onClick={() => openBook(h.pid)}
                          >Edit these shares</Btn>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      )}

      <ConfirmModal modal={confirmModal} />
    </div>
  );
}

// ── GROUPS ──
function GroupsView({ players, round, tRounds, courses, pairingsData, teeTimesData, getPlayerTee, user }) {
  const tr = tRounds.find(t => t.round_number === round);
  const course = tr ? courses.find(c => c.id === tr.course_id) : null;
  const groups = useMemo(() => (pairingsData || {})[round] || [], [pairingsData, round]);
  const roundTeeTimes = (teeTimesData || {})[round] || [];

  // The draw is a handful of cards and it used to sit at FS.small with a third
  // of the tab empty below it. So the size comes from the space: measure what
  // the stack has been given and take the biggest rung that fits it — the same
  // bargain the leaderboard strikes, and the one the type scale is written for.
  //
  // Only the players actually on a card count towards the shape, because that
  // is what gets drawn: a pairing pointing at a player who has left the roster
  // renders nothing, and counting it would buy height for a row that is not
  // there and step the whole tab down a rung to pay for it.
  const stackRef = useRef(null);
  const [box, setBox] = useState({ h: 0, w: 0 });
  const drawn = useMemo(
    () => groups.map(grp => grp.map(pid => players.find(p => p.id === pid)).filter(Boolean)),
    [groups, players],
  );
  const sizes = useMemo(() => drawn.map(grp => grp.length), [drawn]);
  // Re-measure when the shape of the draw changes, not when its identity does:
  // a Firestore snapshot that rewrites the same four foursomes is not a reason
  // to read the layout again. The names ride along because the longest one is
  // the other half of the fit, and a substitution can change it.
  const drawShape = `${sizes.join(",")}|${drawn.flat().map(p => p.name).join("|")}`;
  // useLayoutEffect, not useEffect: this measures and then restyles from the
  // measurement, so running it after paint shows one frame at the wrong size.
  // The stack is flex: 1 against a floor, so its height is the space on offer
  // and does NOT move when the rung it feeds changes — no measure/grow loop.
  useLayoutEffect(() => {
    const measure = () => {
      const el = stackRef.current;
      if (!el) return;
      setBox(prev => (prev.h === el.clientHeight && prev.w === el.clientWidth
        ? prev
        : { h: el.clientHeight, w: el.clientWidth }));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [drawShape]);

  // The longest name on the stack, in pixels per pixel of font size — the other
  // half of the fit. Canvas rather than the DOM because a name only overflows
  // once it has been drawn too big, and the point is not to draw it too big.
  //
  // Measured at 100px and divided down, so one measurement covers every rung.
  // toUpperCase() because the app paints names in capitals and text-transform
  // is a CSS thing the canvas knows nothing about — measure the string the
  // browser will draw, not the one Firestore stores. And measured a second
  // time on fonts.ready, because Montserrat arrives over the network and the
  // fallback it is measured against until then is the narrower of the two,
  // which is the direction that truncates.
  const [nameWidthPerPx, setNameWidthPerPx] = useState(0);
  useLayoutEffect(() => {
    const names = drawn.flat().map(p => p.name);
    if (names.length === 0) return undefined;
    let live = true;
    const measureNames = () => {
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx || !live) return;
      ctx.font = `600 100px ${FONT}`;
      setNameWidthPerPx(nameWidthCeiling(names.map(n => ctx.measureText(n.toUpperCase()).width / 100)));
    };
    measureNames();
    if (document.fonts) document.fonts.ready.then(measureNames);
    return () => { live = false; };
  }, [drawn]);

  const fit = fitPairings(box.h, sizes, box.w, nameWidthPerPx);
  const { rowLine, headLine } = rungLines(fit);

  const getTeeColor = (p) => {
    if (!course) return "#e8e8e8";
    const tee = getPlayerTee(round, p.id, course);
    return tee?.color || "#e8e8e8";
  };
  const getTeeName = (p) => {
    if (!course) return "";
    const tee = getPlayerTee(round, p.id, course);
    return tee?.name || "";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: FS.title, margin: 0, fontWeight: 800, display: "inline" }}>Round {round}</h2>
        {course && <span style={{ fontSize: FS.small, color: K.t3, marginLeft: 10 }}>{course.name} · Par {course.par}</span>}
      </div>
      {groups.length > 0 ? (
        // The stack takes the rest of the tab whatever it holds — that height
        // IS the input to the fit above. overflowY stays auto as a backstop:
        // a draw too deep for even the smallest rung scrolls rather than
        // losing its last group off the bottom.
        <div ref={stackRef} style={{ display: "flex", flexDirection: "column", gap: CARD_GAP, flex: 1, minHeight: 0, overflowY: "auto" }}>
          {drawn.map((rows, gi) => {
            const teeTime = roundTeeTimes[gi];
            return (
            <div key={gi} style={{ background: K.card, borderRadius: R.md, border: `1px solid ${K.bdr}`, overflow: "hidden", flexShrink: 0 }}>
              <div style={{ padding: `${fit.headPad}px 12px`, fontSize: fit.head, lineHeight: `${headLine}px`, fontWeight: 700, color: K.acc, borderBottom: `1px solid ${K.bdr}`, background: K.accGlow, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{teeTime || `Group ${gi + 1}`}</span>
                {teeTime && <span style={{ fontSize: fit.headSub, fontWeight: 500, color: K.t3 }}>Group {gi + 1}</span>}
              </div>
              {rows.map((p, pi) => {
                const ch = course ? (() => { const tee = getPlayerTee(round, p.id, course); return calcCH(p.handicap_index, tee?.slope || course.slope, tee?.rating || course.rating, tee?.par || course.par); })() : 0;
                const teeName = getTeeName(p);
                const teeClr = getTeeColor(p);
                const isMe = p.id === user.id;
                return (
                  <div key={p.id} style={{ padding: `${fit.rowPad}px 12px`, lineHeight: `${rowLine}px`, display: "grid", gridTemplateColumns: "5fr 1.6fr 2.4fr 2fr", alignItems: "center", borderBottom: pi < rows.length - 1 ? `1px solid ${K.bdr}${ALPHA.wash}` : "none", background: isMe ? K.t2 + ALPHA.wash : "transparent" }}>
                    {/* The name is the one cell that can outgrow its column as
                        the rung climbs, so it ellipses rather than wrapping —
                        a wrapped row is a row taller than the fit paid for. */}
                    <span style={{ fontWeight: 600, fontSize: fit.name, color: isMe ? K.gold : K.t1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    <span style={{ fontSize: fit.cell, fontWeight: 600, color: K.t2, textAlign: "center" }}>{p.handicap_index}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: fit.cell, fontWeight: 600, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", color: isDarkTee(teeClr) ? "#9ca3af" : isLightTee(teeClr) ? K.t3 : teeClr }}>
                      {teeName && <>
                        <TeeColorSwatch color={teeClr} name={teeName} size={fit.swatch} />
                        {teeName}
                      </>}
                    </span>
                    <span style={{ color: K.t2, fontSize: fit.cell, fontWeight: 500, textAlign: "right", whiteSpace: "nowrap" }}>{course ? `CH ${ch}` : "–"}</span>
                  </div>
                );
              })}
            </div>
          )})}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: FS.jumbo, marginBottom: 12 }}>👥</div>
          <div style={{ fontSize: FS.body, fontWeight: 700, color: K.t1, marginBottom: 6 }}>No Pairings Set</div>
          <div style={{ fontSize: FS.small, color: K.t3 }}>Pairings will appear here once the tournament director sets them up.</div>
        </div>
      )}
    </div>
  );
}

// ── ADMIN ──
// The tee-colour dot on a player tile in the draw. Rendered whether or not the
// player HAS a tee yet: the slot is what lines the dots up into a column down
// the grid, and a tile that simply omits it shunts its name left and breaks the
// column for every tile beside it.
//
// The ring is what keeps a dark tee marker visible on a dark tile — so it is
// drawn in the body ink, which is near-white in the dark theme and near-black
// in daylight. A hardcoded white one vanishes the moment the app is light.
const TeeDot = ({ color }) => (
  <span style={{
    width: 7, height: 7, borderRadius: "50%", flexShrink: 0, display: "inline-block",
    background: color || "transparent",
    boxShadow: color ? `0 0 0 1px ${K.t1}${ALPHA.hair}` : "none",
  }} />
);

// ── PAIRINGS EDITOR ──
function PairingsEditor({ activePlayers, pairingsData, setPairings, tRounds, courses, teeTimesData, setTeeTimesData, roundDates, onSetRoundDate, scoringOpen, onSetScoringOpen, pairingStrategy, onSetPairingStrategy, leaderboard, finalizedRounds, getPlayerTee, editRound, holeData }) {
  // Themed confirmations. Also closes a latent hazard: the generate guard
  // below called the GLOBAL window.confirm, so the day anyone added
  // useConfirm to this component it would have started returning a Promise
  // — always truthy — and silently stopped asking. That is exactly how the
  // admin Start Fresh button lost its confirmation.
  const { confirm, confirmModal } = useConfirm();
  const numGroups = Math.ceil(activePlayers.length / 4);

  // Seeded once per mount from the saved pairings. The parent keys this editor
  // on the round and the roster size, so a change to either remounts it and
  // re-runs this initializer — which is what a prop-syncing effect used to do,
  // minus the extra render pass and minus the risk of the load racing a save.
  const [groups, setGroups] = useState(() => groupsForRound(pairingsData, editRound, numGroups));
  const [selected, setSelected] = useState(null);
  const [genMsg, setGenMsg] = useState(null); // { tone: "ok"|"warn", text } — result of the last auto-generate

  // Persist a set of groups the director just changed. Saving belongs here, in
  // the handlers that make an edit, rather than in an effect watching `groups`:
  // an effect cannot tell an edit apart from the initial load, which is why the
  // old one needed an isFirstRender ref to avoid saving the freshly-loaded
  // state straight back over the round's real pairings.
  const commitGroups = (next) => {
    setGroups(next);
    setSelected(null);
    const nonEmpty = next.filter(g => g.length > 0);
    // Only write an empty set when there is something saved to clear.
    if (nonEmpty.length > 0 || (pairingsData || {})[editRound]) setPairings(editRound, nonEmpty);
  };

  // ── Auto-pairing strategy (configurable per round) ──
  const cfg = resolvePairingCfg(pairingStrategy, editRound);
  const setMode = (mode) => {
    if (!onSetPairingStrategy) return;
    onSetPairingStrategy(editRound, { ...cfg, mode });
    setGenMsg(null);
  };
  const setLeadersLast = (leadersLast) => {
    if (!onSetPairingStrategy) return;
    onSetPairingStrategy(editRound, { ...cfg, leadersLast });
  };

  // Generate pairings for the current round using the selected method. The result is
  // written into local `groups`, which the existing auto-save effect persists to
  // Firestore — so the director can still hand-tweak afterward exactly as before.
  const generatePairings = async () => {
    const pids = activePlayers.map(p => p.id);
    if (pids.length === 0) return;
    const hasExisting = groups.some(g => g.length > 0);
    if (hasExisting) {
      // What is BEHIND the change, said before the tap. Scores are keyed by
      // player+round+hole, not by group, so re-drawing does not move or delete
      // them — it re-attaches them to whoever ends up sharing a card. A
      // director re-pairing round 2 at lunch is entitled to know that four
      // players are already eight holes deep. See lib/scoreGuard.
      const impact = pairingScoreImpact({ groups, holeData, round: editRound });
      const nameOf = (pid) => activePlayers.find(p => p.id === pid)?.name || pid;
      const ok = await confirm({
        title: `Replace the Round ${editRound} pairings?`,
        message: impact.hasScores
          ? `${impact.holes} hole${impact.holes === 1 ? "" : "s"} are already posted for this round — ${describeScored(impact.scored, nameOf)}.\n\n`
            + "Those scores are NOT deleted and they keep counting on the leaderboard. They stay with the player, so after a re-draw they appear under whichever group that player lands in.\n\n"
            + "You can still adjust the new groups by hand afterward."
          : "You can still adjust them by hand afterward.",
        confirmLabel: "Replace",
        destructive: impact.hasScores,
      });
      if (!ok) return;
    }

    if (cfg.mode === "avoid_repeats") {
      const partners = buildPriorPartners(pairingsData, editRound);
      const anyPrior = Object.keys(partners).length > 0;
      if (!anyPrior) {
        setGenMsg({ tone: "warn", text: `No earlier-round pairings found. Set Round ${editRound - 1} pairings first so there's something to separate.` });
        return;
      }
      const { groups: ng, repeats } = optimizeAvoidRepeats(pids, numGroups, partners);
      const padded = ng.map(g => g.slice());
      while (padded.length < numGroups) padded.push([]);
      commitGroups(padded);
      // With foursomes (groups < 4 in count) some overlap is mathematically forced.
      const zeroPossible = numGroups >= 4;
      if (repeats === 0) {
        setGenMsg({ tone: "ok", text: "Generated — no one repeats a partner from an earlier round." });
      } else {
        setGenMsg({ tone: "warn", text: `Generated with ${repeats} repeat pair${repeats === 1 ? "" : "s"} (the minimum possible).${zeroPossible ? "" : " Foursomes can't be fully separated across only " + numGroups + " groups — each group keeps one returning pair."}` });
      }
      return;
    }

    if (cfg.mode === "leaderboard") {
      // Standings order (best net first), restricted to active players in this field.
      const activeIds = new Set(pids);
      const ordered = (leaderboard || []).filter(p => activeIds.has(p.id));
      const anyScores = ordered.some(p => p.roundsPlayed > 0);
      if (!anyScores) {
        setGenMsg({ tone: "warn", text: "No scores posted yet — leaderboard order isn't set. Play an earlier round first, or pair this round another way." });
        return;
      }
      // Re-rank through the canonical comparator rather than trusting the
      // incoming array's order. Filtering a ranked list does preserve order, so
      // this is a no-op today — but it is the call that makes "pairings are
      // drawn in leaderboard order" true by construction rather than by a
      // convention some future caller could break.
      const orderedIds = rankIndividualBoardIds(ordered);
      // Append any active players missing from the leaderboard array (safety net).
      pids.forEach(id => { if (!orderedIds.includes(id)) orderedIds.push(id); });
      const ng = groupByLeaderboard(orderedIds, numGroups, cfg.leadersLast);
      const padded = ng.map(g => g.slice());
      while (padded.length < numGroups) padded.push([]);
      commitGroups(padded);
      setGenMsg({ tone: "ok", text: `Grouped by current standings — leaders tee off ${cfg.leadersLast ? "last" : "first"}.` });
      return;
    }
  };

  // Parse time string to minutes since midnight
  const parseTime = (str) => {
    if (!str) return null;
    const match = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!match) return null;
    let h = parseInt(match[1]);
    const m = parseInt(match[2]);
    const ampm = (match[3] || "").toUpperCase();
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return h * 60 + m;
  };

  // Format minutes since midnight to time string
  const fmtTime = (mins) => {
    if (mins == null) return "";
    let h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    const ampm = h >= 12 ? "PM" : "AM";
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
  };

  // Normalize raw input like "800", "8:00", "130" into "8:00 AM", "1:30 PM"
  const normalizeTime = (raw) => {
    if (!raw) return "";
    const stripped = raw.replace(/[^0-9:]/g, "");
    if (!stripped) return raw;
    let h, m;
    if (stripped.includes(":")) {
      const parts = stripped.split(":");
      h = parseInt(parts[0]);
      m = parseInt(parts[1]) || 0;
    } else if (stripped.length <= 2) {
      h = parseInt(stripped);
      m = 0;
    } else {
      // "800" → 8:00, "130" → 1:30, "1030" → 10:30
      const num = parseInt(stripped);
      h = Math.floor(num / 100);
      m = num % 100;
    }
    if (isNaN(h) || h < 0 || h > 23 || m < 0 || m > 59) return raw;
    // Smart AM/PM: 1-6 = PM (afternoon tee times), 7-12 = AM
    const ampm = (h >= 1 && h <= 6) ? "PM" : (h >= 7 && h <= 11) ? "AM" : h === 12 ? "PM" : "AM";
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${displayH}:${m.toString().padStart(2, "0")} ${ampm}`;
  };

  const updateTeeTime = (gi, value) => {
    const normalized = normalizeTime(value);
    const current = (teeTimesData[editRound] || []).slice();
    while (current.length < numGroups) current.push("");
    current[gi] = normalized;

    // Auto-propagate to subsequent groups
    const newMins = parseTime(normalized);
    if (newMins != null && gi < numGroups - 1) {
      let interval = TEE_INTERVAL_MIN;
      if (gi > 0) {
        const prevMins = parseTime(current[gi - 1]);
        if (prevMins != null) {
          interval = newMins - prevMins;
          if (interval <= 0) interval = TEE_INTERVAL_MIN;
        }
      }
      for (let i = gi + 1; i < numGroups; i++) {
        const baseMins = parseTime(current[i - 1]);
        if (baseMins != null) {
          current[i] = fmtTime(baseMins + interval);
        }
      }
    }

    setTeeTimesData(prev => ({ ...prev, [editRound]: current }));
  };

  const getName = (pid) => activePlayers.find(p => p.id === pid)?.name || pid;
  const getShortName = (pid) => { const n = getName(pid); const parts = n.split(" "); return parts.length > 1 ? parts[0] + " " + parts[1][0] : n; };
  const tapPlayer = (pid) => {
    setSelected(selected === pid ? null : pid);
  };

  const tapSlot = (gi) => {
    if (!selected) return;
    if (groups[gi].length >= 4) return;
    commitGroups(assignToGroup(groups, gi, selected));
  };

  const removeFromGroup = (gi, pid) => {
    commitGroups(removeFromGroupPure(groups, gi, pid));
  };

  const isAssigned = (pid) => groups.some(g => g.includes(pid));

  const tapGroupPlayer = (gi, pid) => {
    if (selected === pid) {
      setSelected(null);
    } else if (selected) {
      // Swap: the tapped player leaves, the selected one takes the seat. One
      // pass — this used to be a remove followed by a setTimeout(0) so the
      // second update could see the first one's result.
      commitGroups(swapIntoGroup(groups, gi, pid, selected));
    } else {
      setSelected(pid);
    }
  };

  return (
    <div>
      {finalizedRounds[editRound] && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: K.bdr + ALPHA.wash, borderRadius: R.sm, marginBottom: 10, border: `1px solid ${K.bdr}${ALPHA.hair}` }}>
          <span style={{ fontSize: FS.small }}>🔒</span>
          <span style={{ fontSize: FS.label, color: K.t3, fontWeight: 600 }}>Round {editRound} is finalized — view only</span>
        </div>
      )}
      <div style={{ opacity: finalizedRounds[editRound] ? 0.6 : 1, pointerEvents: finalizedRounds[editRound] ? "none" : "auto" }}>
      {/* The scoring gate. The play-date field that used to sit beside it is
          gone: the date lives under its round's pill now, on this tab too, and
          two controls for one value three inches apart is how they end up
          disagreeing. The line below still reads the date, because what the
          gate does depends on it. */}
      {onSetRoundDate && (
        <div style={{ background: K.card, borderRadius: R.lg, padding: 10, marginBottom: 12, border: `1px solid ${K.bdr}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: FS.label, fontWeight: 700, color: K.t3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Scoring</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end" }}>
              <div onClick={() => onSetScoringOpen && onSetScoringOpen(editRound, !((scoringOpen || {})[editRound]))} style={{
                display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none",
                background: K.bdr + ALPHA.tint, borderRadius: R.pill, padding: "2px 3px", gap: 1,
              }}>
                {[["Auto", false], ["Open now", true]].map(([label, val]) => {
                  const active = !!((scoringOpen || {})[editRound]) === val;
                  return (
                    <span key={label} style={{
                      fontSize: FS.label, fontWeight: 700, padding: "4px 8px", borderRadius: R.xl, textAlign: "center",
                      background: active ? (val ? K.acc + ALPHA.hair : K.t3 + ALPHA.hair) : "transparent",
                      color: active ? (val ? K.acc : K.t2) : K.t3 + ALPHA.panel,
                      transition: `background ${MOTION}, color ${MOTION}`,
                    }}>{label}</span>
                  );
                })}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: FS.label, color: K.t3, lineHeight: 1.5 }}>
            {(scoringOpen || {})[editRound]
              ? <>Scoring is <strong style={{ color: K.acc }}>open now</strong> for all groups this round.</>
              : (roundDates || {})[editRound]
                ? <>Scoring opens {SCORING_LEAD_MIN} minutes before tee times on <strong style={{ color: K.t2 }}>{fmtRoundDate((roundDates || {})[editRound])}</strong>.</>
                : <>Set a play date to enable automatic scoring, or flip to <strong style={{ color: K.t2 }}>Open now</strong> to allow scoring immediately.</>}
          </div>
        </div>
      )}
      {/* Pairing method — configurable per round. Manual keeps the hand-set builder
          below; the auto methods fill the groups, which the director can then tweak. */}
      <div style={{ background: K.card, borderRadius: R.lg, padding: 10, marginBottom: 12, border: `1px solid ${K.bdr}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: FS.label, fontWeight: 700, color: K.t3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Pairing method</span>
          <div style={{ display: "flex", alignItems: "center", background: K.bdr + ALPHA.tint, borderRadius: R.pill, padding: "2px 3px", gap: 1 }}>
            {PAIRING_MODES.map(m => {
              const active = cfg.mode === m;
              return (
                <span key={m} onClick={() => setMode(m)} style={{
                  fontSize: FS.label, fontWeight: 700, padding: "4px 9px", borderRadius: R.xl, textAlign: "center", cursor: "pointer", userSelect: "none",
                  background: active ? K.acc + ALPHA.hair : "transparent",
                  color: active ? K.acc : K.t3 + ALPHA.panel,
                  transition: `background ${MOTION}, color ${MOTION}`,
                }}>{PAIRING_MODE_LABEL[m]}</span>
              );
            })}
          </div>
        </div>

        {cfg.mode === "leaderboard" && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: FS.label, fontWeight: 600, color: K.t3 }}>Leaders tee off</span>
            <div style={{ display: "flex", alignItems: "center", background: K.bdr + ALPHA.tint, borderRadius: R.pill, padding: "2px 3px", gap: 1 }}>
              {[["Last", true], ["First", false]].map(([label, val]) => {
                const active = cfg.leadersLast === val;
                return (
                  <span key={label} onClick={() => setLeadersLast(val)} style={{
                    fontSize: FS.label, fontWeight: 700, padding: "4px 9px", borderRadius: R.xl, textAlign: "center", cursor: "pointer", userSelect: "none",
                    background: active ? K.t3 + ALPHA.hair : "transparent",
                    color: active ? K.t2 : K.t3 + ALPHA.panel,
                  }}>{label}</span>
                );
              })}
            </div>
          </div>
        )}

        {cfg.mode !== "manual" && (
          <button onClick={generatePairings} style={{
            marginTop: 10, width: "100%", padding: "9px 0", borderRadius: R.sm, cursor: "pointer",
            background: K.acc + ALPHA.wash, border: `1.5px solid ${K.acc}${ALPHA.line}`, color: K.acc,
            fontSize: FS.small, fontWeight: 700,
          }}>
            {groups.some(g => g.length > 0) ? "Regenerate pairings" : "Generate pairings"}
          </button>
        )}

        {/* Scores with no group. The wreckage of a re-draw that already
            happened: still live in the database and still counting on the
            leaderboard, but invisible on the scoring screen because nobody
            holds a card for them. Surfaced here, where the draw is edited. */}
        {(() => {
          const orphans = orphanedScores({ holeData, groups, round: editRound, players: activePlayers });
          if (!orphans.length) return null;
          const nameOf = (pid) => activePlayers.find(p => p.id === pid)?.name || pid;
          const n = totalHoles(orphans);
          return (
            <div style={{
              marginTop: 8, padding: "8px 10px", borderRadius: R.sm,
              background: K.warn + ALPHA.wash, border: `1px solid ${K.warn}${ALPHA.line}`,
              color: K.warn, fontSize: FS.label, fontWeight: 600, lineHeight: 1.5,
            }}>
              {n} hole{n === 1 ? "" : "s"} posted by players not in any Round {editRound} group — {describeScored(orphans, nameOf)}.
              These still count on the leaderboard. Put them back in a group, or discard the card from the Rounds tab.
            </div>
          );
        })()}

        {genMsg && (
          <div style={{
            marginTop: 8, fontSize: FS.label, lineHeight: 1.5, padding: "6px 8px", borderRadius: R.sm,
            background: (genMsg.tone === "ok" ? K.acc : K.warn)  + ALPHA.wash,
            border: `1px solid ${(genMsg.tone === "ok" ? K.acc : K.warn)}30`,
            color: genMsg.tone === "ok" ? K.acc : K.warn,
          }}>{genMsg.text}</div>
        )}
      </div>

      {/* Player pool - 4 per row */}
          <div style={{
            background: K.card, borderRadius: R.lg, padding: 10, marginBottom: 12,
            border: `1px solid ${K.bdr}`,
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
              {activePlayers.map(p => {
                const pid = p.id;
                const isSel = selected === pid;
                const assigned = isAssigned(pid);
                const _tc = (() => { const _tr = tRounds.find(t => t.round_number === editRound); const _c = _tr ? courses.find(c => c.id === _tr.course_id) : null; if (!_c || !getPlayerTee) return null; const _t = getPlayerTee(editRound, pid, _c); if (!_t) return null; const _col = (_t.color||"").toLowerCase(); const _real = _col && _col !== "#ffffff" && _col !== "white" && _col !== "#000000" && _col !== "black" && _col !== "#fff"; return _real ? _t.color : TEE_PALETTE[(_c.tee_boxes||[]).findIndex(tb=>tb.name===_t.name) % TEE_PALETTE.length] || null; })();
                return (
                  <button key={pid} onClick={() => tapPlayer(pid)} style={{
                    padding: "6px 6px", borderRadius: R.sm, cursor: "pointer", textAlign: "left",
                    background: isSel ? K.acc + ALPHA.tint : K.hover,
                    border: `1.5px solid ${isSel ? K.acc : K.bdr}`,
                    color: isSel ? K.acc : K.t1,
                    opacity: assigned && !isSel ? DIM_PLACED : 1,
                    transition: `opacity ${MOTION}`,
                  }}>
                    <div style={{ fontSize: FS.label, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 3 }}>
                      <TeeDot color={_tc} />
                      {getShortName(pid)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

      {/* Groups */}
      {groups.map((grp, gi) => {
        const canDrop = selected && grp.length < 4 && !grp.includes(selected);
        const teeTime = ((teeTimesData[editRound] || [])[gi]) || "";
        return (
          <div key={gi} onClick={() => { if (canDrop) tapSlot(gi); }} style={{
            background: K.card, borderRadius: R.lg, marginBottom: 8, padding: 10,
            border: `1.5px solid ${canDrop ? K.acc : K.bdr}`,
            cursor: canDrop ? "pointer" : "default",
            transition: `border-color ${MOTION}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: grp.length > 0 ? 6 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: FS.label, fontWeight: 700, color: K.acc }}>Group {gi + 1} <span style={{ fontWeight: 400, color: K.t3, fontSize: FS.micro }}>({grp.length}/4)</span></span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Tee time"
                  value={teeTime}
                  onClick={e => e.stopPropagation()}
                  onChange={e => {
                    const current = (teeTimesData[editRound] || []).slice();
                    while (current.length < numGroups) current.push("");
                    current[gi] = e.target.value;
                    setTeeTimesData(prev => ({ ...prev, [editRound]: current }));
                  }}
                  onBlur={e => { updateTeeTime(gi, e.target.value); }}
                  onKeyDown={e => { if (e.key === "Enter") { e.target.blur(); } }}
                  style={{
                    width: 74, padding: "2px 4px", borderRadius: R.xs,
                    border: `1px solid ${teeTime ? K.acc + ALPHA.hair : K.warn}`,
                    background: teeTime ? K.acc + ALPHA.wash : K.warn + ALPHA.wash,
                    color: teeTime ? K.acc : K.warn,
                    fontSize: FS.micro, fontWeight: 600, textAlign: "center",
                  }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {canDrop && <span style={{ fontSize: FS.micro, color: K.acc, fontWeight: 600 }}>Tap to add {getShortName(selected)}</span>}
                {grp.length > 0 && (
                  <span onClick={e => { e.stopPropagation(); commitGroups(clearGroup(groups, gi)); }} style={{ fontSize: FS.micro, color: K.danger, cursor: "pointer", border: `1px solid ${K.danger}${ALPHA.hair}`, borderRadius: R.xs, padding: "1px 5px", fontWeight: 600 }}>Clear</span>
                )}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
              {grp.map(pid => {
                const isSel = selected === pid;
                const _tc2 = (() => { const _tr = tRounds.find(t => t.round_number === editRound); const _c = _tr ? courses.find(c => c.id === _tr.course_id) : null; if (!_c || !getPlayerTee) return null; const _t = getPlayerTee(editRound, pid, _c); if (!_t) return null; const _col = (_t.color||"").toLowerCase(); const _real = _col && _col !== "#ffffff" && _col !== "white" && _col !== "#000000" && _col !== "black" && _col !== "#fff"; return _real ? _t.color : TEE_PALETTE[(_c.tee_boxes||[]).findIndex(tb=>tb.name===_t.name) % TEE_PALETTE.length] || null; })();
                return (
                  <button key={pid} onClick={e => { e.stopPropagation(); tapGroupPlayer(gi, pid); }} style={{
                    // Room on the right for the ✕ that sits over this corner —
                    // a centred name cleared it by luck, a left-aligned one
                    // would run its ellipsis underneath.
                    padding: "6px 12px 6px 6px", borderRadius: R.sm, textAlign: "left", cursor: "pointer", position: "relative",
                    background: isSel ? K.acc + ALPHA.tint : K.hover,
                    border: `1.5px solid ${isSel ? K.acc : K.bdr}`,
                    color: K.t1,
                  }}>
                    <span onClick={e => { e.stopPropagation(); removeFromGroup(gi, pid); }} style={{
                      position: "absolute", top: 1, right: 3, background: "transparent", border: "none",
                      color: K.t3, fontSize: FS.micro, cursor: "pointer", padding: 0, lineHeight: 1,
                    }}>✕</span>
                    <div style={{ fontSize: FS.label, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 3 }}>
                      <TeeDot color={_tc2} />
                      {getShortName(pid)}
                    </div>
                  </button>
                );
              })}
              {Array.from({ length: 4 - grp.length }).map((_, si) => (
                <div key={`e${si}`} onClick={e => { e.stopPropagation(); if (selected) tapSlot(gi); }} style={{
                  borderRadius: R.sm, border: `1.5px dashed ${canDrop ? K.acc + ALPHA.line : K.bdr}`,
                  minHeight: 38, display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: canDrop ? "pointer" : "default",
                }}>
                  <span style={{ fontSize: FS.body, color: canDrop ? K.acc + ALPHA.line : K.t3 + ALPHA.hair, fontWeight: 300 }}>+</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      </div>
      <ConfirmModal modal={confirmModal} />
    </div>
  );
}

// ── Course-API parsing ─────────────────────────────────────────────────────
// Hoisted out of doCourseSearch so the course EDITOR can reach the same two
// APIs with the same parsing. Refetching a course's tees and searching for a
// new course have to agree about what a tee box is, and the only way to be
// sure of that is for them to run the same code.
const STATE_NAMES = { AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming" };
const STATE_ABBREVS = Object.fromEntries(Object.entries(STATE_NAMES).map(([k,v]) => [v.toUpperCase(), k]));
const stateMatches = (courseState, filter) => {
  if (!filter || !courseState) return true;
  const cs = courseState.trim().toUpperCase();
  const f = filter.trim().toUpperCase();
  if (cs === f) return true; // exact match (MI === MI)
  if (STATE_NAMES[f] && cs === STATE_NAMES[f].toUpperCase()) return true; // MI → Michigan
  if (STATE_ABBREVS[cs] && STATE_ABBREVS[cs] === f) return true; // Michigan → MI
  return false;
};

const decodeHtml = (str) => str ? str.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'") : str;
const hasRealSlope = (c) => (c.tee_boxes || []).some(tb => parseInt(tb.slope) !== 113) || (parseInt(c.slope) !== 113 && !!c.slope);

const parseRapidAPI = (rawCourses, stateFilter) => rawCourses
  .filter(c => stateMatches(c.state, stateFilter))
  .map((c, ci) => {
    // This API: top-level courseRating/slopeRating, scorecard[].tees.teeBox1/teeBox2...
    const sc = Array.isArray(c.scorecard) ? c.scorecard : [];
    const hole_pars = sc.map(h => parseInt(h.Par) || 4);
    const hole_handicaps = sc.map(h => parseInt(h.Handicap) || 0);
    const par = hole_pars.reduce((a, b) => a + b, 0) || 72;
    // Collect all tee box keys across all holes
    const teeKeys = [...new Set(sc.flatMap(h => h.tees ? Object.keys(h.tees) : []))];
    const tees = teeKeys.length ? teeKeys.map((key, ti) => {
      const sample = sc.find(h => h.tees?.[key]);
      const color = sample?.tees?.[key]?.color || key;
      const yardage = sc.reduce((a, h) => a + (parseInt(h.tees?.[key]?.yards) || 0), 0);
      const hole_yards = sc.map(h => parseInt(h.tees?.[key]?.yards) || 0);
      return {
        name: color || key,
        color: resolveTeeColor({ name: color || key, color: color || "" }, ti),
        slope: parseInt(c.slopeRating) || 113,
        rating: parseFloat(c.courseRating) || 72.0,
        par, yardage, hole_yards,
      };
    }) : [{
      name: "Default",
      color: resolveTeeColor({ name: "Default", color: "" }, 0),
      slope: parseInt(c.slopeRating) || 113,
      rating: parseFloat(c.courseRating) || 72.0,
      par, yardage: 0, hole_yards: [],
    }];
    return {
      id: `rapid_${c._id || ci}`,
      name: decodeHtml(c.name) || "Unknown",
      city: c.city || "", state: c.state || "",
      par, slope: parseInt(c.slopeRating) || 113,
      rating: parseFloat(c.courseRating) || 72.0,
      hole_pars, hole_handicaps, tee_boxes: tees,
      _source: "RapidAPI",
    };
  });

const parseGolfCourseAPI = (rawCourses) => {
  const arr = Array.isArray(rawCourses) ? rawCourses : (rawCourses.courses || []);
  return arr.map((c, ci) => {
    const teesObj = c.tees || {};
    const allTees = Array.isArray(teesObj.male) && teesObj.male.length ? teesObj.male : (teesObj.female || []);
    const tees = allTees.map((t, ti) => ({
      name: t.tee_name || "Default",
      color: resolveTeeColor({ name: t.tee_name || "", color: "" }, ti),
      rating: parseFloat(t.course_rating) || 72.0,
      slope: parseInt(t.slope_rating) || 113,
      par: parseInt(t.par_total) || 72,
      yardage: parseInt(t.total_yards) || 0,
      hole_yards: (t.holes || []).map(h => parseInt(h.yardage) || 0),
    }));
    const firstTee = allTees[0]; const holes = firstTee?.holes || [];
    return {
      id: `gc_${c.id || ci}`,
      name: decodeHtml([c.club_name, c.course_name].filter(Boolean).join(" – ") || c.name || "Unknown"),
      city: c.location?.city || c.city || "", state: c.location?.state || c.state || "",
      par: parseInt(firstTee?.par_total) || 72,
      slope: parseInt(firstTee?.slope_rating) || 113,
      rating: parseFloat(firstTee?.course_rating) || 72.0,
      hole_pars: holes.map(h => parseInt(h.par) || 4),
      hole_handicaps: holes.map(h => parseInt(h.handicap) || 0),
      tee_boxes: tees,
      _source: "GolfCourseAPI",
    };
  });
};

// ── fetchCourseTees ────────────────────────────────────────────────────────
// Ask the course APIs again for ONE course's tee boxes. Both endpoints, same
// parsing as the search, best name match wins.
//
// Why the editor needs this: a course arrives with whatever tees the API had
// that day, and the editor can delete them. Delete the wrong one — or find the
// course was imported with a single "Default" tee when it really has five —
// and the only way back used to be removing the course and searching for it
// again, which loses every hand edit and every round already assigned to it.
const fetchCourseTees = async (name, state) => {
  const q = (name || "").trim();
  if (q.length < 2) return [];
  const stateParam = state ? `&state=${encodeURIComponent(state)}` : "";
  const found = [];
  try {
    const r = await fetch(`/api/courses2?search=${encodeURIComponent(q)}${stateParam}`);
    if (r.ok) {
      const raw = await r.json();
      found.push(...parseRapidAPI(Array.isArray(raw) ? raw : (raw.courses || []), state));
    }
  } catch (e) { console.log("[refetch/RapidAPI] failed:", e); }
  try {
    const r2 = await fetch(`/api/courses?search=${encodeURIComponent(q)}${stateParam}`);
    if (r2.ok) found.push(...parseGolfCourseAPI(await r2.json()));
  } catch (e) { console.log("[refetch/GolfCourseAPI] failed:", e); }
  if (!found.length) return [];
  // Exact name first, then anything containing it, then whatever came back —
  // and among equals prefer the one carrying real ratings over a row of 113s.
  const lc = q.toLowerCase();
  const rank = (c) => {
    const n = (c.name || "").toLowerCase();
    return (n === lc ? 0 : n.includes(lc) || lc.includes(n) ? 1 : 2) * 2 + (hasRealSlope(c) ? 0 : 1);
  };
  const best = [...found].sort((a, b) => rank(a) - rank(b))[0];
  return best?.tee_boxes || [];
};

// ── TEE ASSIGNER ──
function TeeAssigner({ activePlayers, tRounds, courses, teeData, setTeeBulk, finalizedRounds, editRound, teesSaved, onTeesModify }) {

  const tr = tRounds.find(t => t.round_number === editRound);
  const course = tr ? courses.find(c => c.id === tr.course_id) : null;
  const tees = course?.tee_boxes || [];
  const assignments = (teeData || {})[editRound] || {};
  const [chDeltas, setChDeltas] = useState({});

  const assign = (pid, teeName) => {
    // Compute delta vs current CH
    const oldTeeObj = tees.find(t => t.name === (assignments[pid] || getDefaultTee(tees)?.name || tees[0]?.name));
    const newTeeObj = tees.find(t => t.name === teeName);
    const player = activePlayers.find(p => p.id === pid);
    if (oldTeeObj && newTeeObj && player) {
      const oldCH = calcCH(player.handicap_index, oldTeeObj.slope, oldTeeObj.rating, oldTeeObj.par);
      const newCH = calcCH(player.handicap_index, newTeeObj.slope, newTeeObj.rating, newTeeObj.par);
      const delta = newCH - oldCH;
      if (delta !== 0) {
        setChDeltas(prev => ({ ...prev, [pid]: delta }));
        setTimeout(() => setChDeltas(prev => { const n = {...prev}; delete n[pid]; return n; }), 3500);
      }
    }
    setTeeBulk(editRound, { ...assignments, [pid]: teeName });
    if (teesSaved && teesSaved[editRound]) onTeesModify && onTeesModify(editRound);
  };

  const setAll = (teeName) => {
    const bulk = {};
    activePlayers.forEach(p => { bulk[p.id] = teeName; });
    setTeeBulk(editRound, bulk);
    if (teesSaved && teesSaved[editRound]) onTeesModify && onTeesModify(editRound);
  };

  // Per-player tees are folded away. Almost every field plays the tee the
  // director set for everyone, so the list of names below the Set-all row was
  // a page of confirmation that nothing was different — and the space it took
  // is where this round's foursomes go now. It opens when one player needs a
  // different box.
  const [openTees, setOpenTees] = useState(false);

  // No course, nothing to assign tees from. This used to read
  // `!finalized && !course`, which let a FINALIZED round with no course
  // through to `course.name` below and crashed the console.
  if (!course) return null;

  return (
    <div style={{ opacity: finalizedRounds[editRound] ? 0.6 : 1, pointerEvents: finalizedRounds[editRound] ? "none" : "auto" }}>
      <div>
        <div>
          {/* The course's tee list, and the set-all control — one thing, not the
              two it used to be (read-only chips on the course card, plus a stack
              of tall buttons here). Slope/rating sits UNDER the colour and name
              rather than beside it, which is what lets three tees share the width
              of a phone; each tile takes an equal share and wraps past four.
              No "Set all" label: the tiles are the only tap targets in the row,
              they carry the same swatches as the player rows below, and the
              title says what tapping does for anyone who hovers. */}
          {tees.length > 0 && !finalizedRounds[editRound] && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(68px, 1fr))", gap: 4, padding: "8px 14px", borderBottom: `1px solid ${K.bdr}${ALPHA.hair}` }}>
              {[...tees].sort((a, b) => (parseFloat(b.slope) || 0) - (parseFloat(a.slope) || 0)).map(tee => {
                // In use = at least one player is on it this round, counting the
                // default nobody has moved off. The accent edge is what tells you
                // at a glance which boxes this round is actually played from —
                // one on a normal round, two when somebody is moved up or back.
                const inUse = activePlayers.some(p =>
                  (assignments[p.id] || getDefaultTee(tees)?.name || tees[0]?.name) === tee.name);
                return (
                <button key={tee.name} onClick={() => setAll(tee.name)} title={`Put every player on ${tee.name}`} style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 0,
                  padding: "5px 4px", borderRadius: R.sm,
                  background: K.inp, border: `1px solid ${inUse ? K.acc : K.bdr}`, color: K.t1, cursor: "pointer",
                }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, maxWidth: "100%", minWidth: 0 }}>
                    <TeeColorSwatch color={resolveTeeColor(tee, 0)} name={tee.name} size={11} style={{ borderRadius: R.xs, flexShrink: 0 }} />
                    <span style={{ fontSize: FS.label, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tee.name}</span>
                  </span>
                  <span style={{ fontSize: FS.micro, color: K.t3, lineHeight: 1 }}>{tee.slope}/{tee.rating}</span>
                </button>
                );
              })}
            </div>
          )}

          {/* The confirm control is a tick beside Edit in the card header — a
              full-width bar to say "yes, those tees" cost more room than the
              tee list it confirmed. See TeeConfirmTick. */}

          {/* Per-player tee assignment */}
          <button onClick={() => setOpenTees(o => !o)} style={{
            width: "100%", marginTop: 8, padding: "8px 14px", background: "transparent", border: "none",
            borderTop: `1px solid ${K.bdr}${ALPHA.hair}`, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          }}>
            <span style={{ fontSize: FS.label, fontWeight: 700, color: K.t3, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Player tees
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              {/* What the list would say if it were open: one tee, or the split.
                  A player with NO assignment used to be counted onto the
                  default tee here, so a round where two men had nothing read
                  "All BLUE" — the summary agreeing that everything was fine
                  while the warning above it said otherwise. They are counted
                  as what they are now, and said last and in red. */}
              {(() => {
                const counts = {};
                let none = 0;
                activePlayers.forEach(p => {
                  const t = assignments[p.id];
                  if (!t || !tees.some(tb => tb.name === t)) { none++; return; }
                  counts[t] = (counts[t] || 0) + 1;
                });
                const names = Object.keys(counts);
                const summary = names.length === 0 ? "" : names.length === 1 && !none ? `All ${names[0]}` : names.map(n => `${counts[n]} ${n}`).join(" · ");
                return (
                  <span style={{ fontSize: FS.label, fontWeight: 700, color: names.length === 1 && !none ? K.t2 : K.acc, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {summary}
                    {none > 0 && <span style={{ color: K.danger }}>{summary ? " · " : ""}{none} none</span>}
                  </span>
                );
              })()}
              <span style={{ fontSize: FS.label, color: K.t3 }}>{openTees ? "▲" : "▼"}</span>
            </span>
          </button>
          <div style={{ overflow: "hidden", display: openTees ? "block" : "none" }}>
            <div>
            {activePlayers.map((p, i) => {
              // No fallback to the default tee. This row used to read
              // `assignments[p.id] || defaultTee?.name`, which drew the default
              // box as SELECTED and printed a course handicap off it — so a
              // player who had never been assigned anything looked, on the one
              // screen whose job is to show tee assignments, exactly like a
              // player who had. An empty assignment is now empty: no tee lit,
              // no CH, and the name in red.
              const currentTee = assignments[p.id] || "";
              const teeObj = tees.find(t => t.name === currentTee);
              const ch = teeObj ? calcCH(p.handicap_index, teeObj.slope, teeObj.rating, teeObj.par) : null;
              return (
                <div key={p.id} style={{
                  padding: "5px 12px", display: "flex", justifyContent: "space-between", alignItems: "center",
                  borderBottom: i < activePlayers.length - 1 ? `1px solid ${K.bdr}${ALPHA.wash}` : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ fontWeight: 600, fontSize: FS.small, color: teeObj ? K.t1 : K.danger }}>{p.name}</span>
                    <span style={{ fontSize: FS.micro, color: K.t2, display: "flex", alignItems: "center", gap: 3 }}>
                      HI {p.handicap_index} · CH {teeObj ? ch : <span style={{ color: K.danger, fontWeight: 700 }}>no tee</span>}
                      {chDeltas[p.id] !== undefined && (
                        <span style={{ fontSize: FS.micro, fontWeight: 700, color: chDeltas[p.id] > 0 ? K.ok : K.danger, display: "flex", alignItems: "center", gap: 1 }}>
                          {chDeltas[p.id] > 0 ? "▲" : "▼"}{Math.abs(chDeltas[p.id])}
                        </span>
                      )}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 2 }}>
                    {[...tees].sort((a, b) => (parseFloat(b.slope) || 0) - (parseFloat(a.slope) || 0)).map(tee => {
                      const isActive = currentTee === tee.name;
                      return (
                        <button key={tee.name} onClick={() => assign(p.id, tee.name)} style={{
                          width: 34, padding: "4px 3px 3px", borderRadius: R.sm, cursor: "pointer",
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                          background: isActive ? K.acc + ALPHA.tint : K.inp,
                          border: isActive ? `1.5px solid ${K.acc}` : `1px solid ${K.bdr}`,
                          transform: isActive ? "scale(1.08)" : "scale(1)",
                          transition: `background ${MOTION} ease, border-color ${MOTION} ease, transform ${MOTION} ease`,
                          willChange: "transform",
                        }}>
                          <TeeColorSwatch color={resolveTeeColor(tee, 0)} name={tee.name} size={14} style={{ borderRadius: R.xs }} />
                          <span style={{ fontSize: FS.micro, fontWeight: 700, color: isActive ? K.acc : K.t3, lineHeight: 1, transition: `color ${MOTION} ease` }}>{tee.name.split("/")[0].substring(0,5)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── The display-name rule ──
// Every screen outside this console shows "First LastInitial" ("Aaron J") —
// which is also where the player ids come from (aaron_j). That is persisted as
// the player's `name` so all existing display code keeps working unchanged;
// first_name / last_name are the full source of truth, edited only here.
// Falls back to first-name-only when no last name is set.
const toDisplayName = (first, last) => {
  const f = (first || "").trim();
  const l = (last || "").trim();
  return l ? `${f} ${l[0].toUpperCase()}` : f;
};
const fullName = (p) =>
  (p?.first_name || p?.last_name)
    ? [p.first_name, p.last_name].filter(Boolean).join(" ").trim()
    : (p?.name || "");
// Best-effort split for a roster that predates first/last being stored: the
// editor seeds from these so an existing player opens with their name already
// in the right boxes rather than blank.
const splitName = (p) => {
  if (p?.first_name || p?.last_name) return { first: p.first_name || "", last: p.last_name || "" };
  const parts = String(p?.name || "").trim().split(/\s+/);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
};

// How many holes a player has actually posted in a round — used by both the
// move-to-inactive confirmation and the discard-scores action, so the number
// the director is warned about is the number that would be affected.
const holesEntered = (holeData, pid, round) =>
  Object.values(holeData?.[`${pid}_${round}`] || {}).filter(s => s > 0 && s !== WD_SCORE).length;

// ── PlayerRow ──
// A read-only summary line. All editing moved into PlayerEditor, following
// Bourbon Cup: the previous design swapped this row for a cramped set of
// inline inputs, which is why it could only ever expose a name and an index —
// there is no room on a phone row for anything more.
function PlayerRow({ player, isLast, onOpen, isDirector, account }) {
  return (
    <button onClick={onOpen} style={{
      width: "100%", textAlign: "left", cursor: "pointer", background: "transparent",
      border: "none", borderBottom: !isLast ? `1px solid ${K.bdr}${ALPHA.hair}` : "none",
      padding: "10px 14px", display: "flex", alignItems: "center", gap: 8,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: FS.body, fontWeight: 600, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {/* 🔗 = this name is claimed by a signed-in account. It replaces the
              "Signed in" list that used to sit in the Event tab restating the
              roster: the question it answered — who can actually post a score —
              is about a player, so it belongs on the player. */}
          {player.name}{account && " 🔗"}{isDirector && " 👑"}
        </div>
        <div style={{ fontSize: FS.label, color: K.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {account?.email || (fullName(player) !== player.name ? fullName(player) : " ")}
        </div>
      </div>
      <div style={{ flexShrink: 0, textAlign: "right" }}>
        <div style={{ fontSize: FS.body, fontWeight: 800, color: K.t1 }}>{player.handicap_index}</div>
        <div style={{ fontSize: FS.micro, fontWeight: 700, color: K.t3, letterSpacing: 1 }}>INDEX</div>
      </div>
      <span style={{ flexShrink: 0, color: K.t3, fontSize: FS.body }}>›</span>
    </button>
  );
}

// ── PlayerEditor ──
// One modal that owns the whole player record, ported from Bourbon Cup's
// Admin. Everything commits on Save, so add and edit behave identically and
// Cancel genuinely discards.
//
// The director toggle IS the grant: it writes `is_director` on that person's
// membership document, the only flag firestore.rules honours. Two things it
// deliberately cannot do, both enforced by the rules rather than here —
// appoint somebody who has never been through the password screen (there is
// no membership document to flag), and change your own (so the last director
// can never lock everyone out).
//
// `returning` is the other half of setting up a new year: the men who have
// played before and are not in this field. Typing a returning player's name
// from memory is the one way to silently break him — his id comes from his
// display name, so a nickname or a full surname mints a second record while
// his account claim still points at the first — so the picker hands back the
// id off his record rather than deriving one. See lib/returningPlayers.
function PlayerEditor({ editing, set, onClose, tPlayers, players, memberships, claims, authUid,
                        holeData, numRounds, onSave, onRemove, notify, confirm, tournamentStarted,
                        returning = [] }) {
  if (!editing) return null;
  const isNew = !!editing.isNew;
  const p = isNew ? null : players.find(x => x.id === editing.pid);
  if (!isNew && !p) return null;

  const defaultNick = toDisplayName(editing.first, editing.last);
  // ── The number this field is overriding ──
  // The WBC Index is the source of truth for what a golfer plays off; the field
  // below is this edition's copy of it, which a director may depart from. So
  // the index is shown beside the field rather than left in another tab: an
  // override you cannot see the original of is just a number somebody typed.
  //
  // For a NEW player it resolves off the name being typed, which is what lets a
  // returning golfer arrive with their own index already offered.
  const wbcRef = (() => {
    const subject = p || { name: editing.nick || defaultNick, first_name: editing.first, last_name: editing.last };
    const histName = matchHistoryName(subject);
    if (!histName) return null;
    const idx = indexFor(histName, { override: p?.index_override ?? null });
    return idx.index == null ? null : idx;
  })();
  const wbcDiffers = !!wbcRef && String(parseFloat(editing.hi) || 0) !== String(wbcRef.index);
  const showPicker = isNew && !editing.linked && returning.length > 0;
  const theirMembership = isNew ? null : membershipForPlayer(memberships, claims, editing.pid);
  const isSelf = !!theirMembership && (theirMembership.id === authUid || theirMembership.uid === authUid);
  const canGrantDirector = !isNew && !!theirMembership && !isSelf;

  // Four reasons the toggle can be unavailable, and they want four different
  // actions from the director. Telling them apart matters most for the last:
  // an unreadable accounts list looks exactly like "nobody has signed in",
  // and the fix has nothing to do with the player on screen.
  const directorHint = isNew
    ? "Add them first, then they sign in and claim this name."
    : accountsUnreadable(memberships)
      ? "Can't read the accounts list, so no crown can be changed. The rules deployed to Firebase are probably older than this app — re-publish firestore.rules, then reopen this."
      : !theirMembership
        ? "They need to sign in and claim this name first."
        : isSelf
          ? "You can't change your own — that's what stops the last director locking everyone out. Ask the other director, or edit it in the Firebase console."
          : "Grants the Admin tab, and every write behind it.";

  const lbl = { fontSize: FS.micro, fontWeight: 800, letterSpacing: 0.5, color: K.t3, textTransform: "uppercase", marginBottom: 3, display: "block" };
  // FS.lead (16px) on purpose — anything smaller makes iOS Safari zoom the
  // page on focus and never zoom back out. Height is condensed via padding.
  const inp = { fontSize: FS.lead, fontWeight: 600, color: K.t1, width: "100%", boxSizing: "border-box", background: K.inp, border: `1px solid ${K.acc}${ALPHA.line}`, borderRadius: R.sm, padding: "7px 10px", outline: "none", fontFamily: FONT };

  // Picking a returning player fills the form from his record — including the
  // WBC Index, which is the app's own number for him and the best first guess
  // at what he plays off. Every box stays editable; the id is the part that is
  // now settled, and it is the part that was never safe to type.
  const pickReturning = (r) => set({
    linked: { id: r.id, name: r.name },
    first: r.first,
    last: r.last,
    nick: r.name === toDisplayName(r.first, r.last) ? "" : r.name,
    hi: r.index == null ? "" : r.index.toFixed(1),
  });

  const doSave = async () => {
    const first = (editing.first || "").trim();
    const last = (editing.last || "").trim();
    if (!first) { notify?.("Enter a first name"); return; }
    const newName = (editing.nick || "").trim() || toDisplayName(first, last);
    const newHI = parseFloat(editing.hi) || 0;
    const newDir = !!editing.dir;

    if (isNew) {
      // pid is the whole point of the picker: with one, the roster row binds
      // to the record that already exists. Without it the caller derives an id
      // from the name, which is right for a genuine first-timer.
      await onSave({ isNew: true, name: newName, first, last, hi: newHI, pid: editing.linked?.id || null });
      notify?.(`Added ${newName}`);
      onClose();
      return;
    }

    const tp = tPlayers.find(x => x.player_id === editing.pid);
    const oldHI = parseFloat(tp?.handicap_index) || 0;
    const wasDir = theirMembership?.is_director === true;
    const dirChanged = canGrantDirector && newDir !== wasDir;

    const changes = [];
    if (first !== (p.first_name || "") || last !== (p.last_name || "") || newName !== p.name)
      changes.push(`Name → ${[first, last].filter(Boolean).join(" ")} (shows as "${newName}")`);
    if (newHI !== oldHI) changes.push(`Index: ${oldHI} → ${newHI}`);
    if (dirChanged) changes.push(`Director: ${wasDir ? "Yes" : "No"} → ${newDir ? "Yes" : "No"}`);
    if (changes.length === 0) { onClose(); return; }

    // The handicap-lock warning, stated as part of the same confirmation
    // rather than as a second dialog behind it. WBC recalculates every
    // round's net score from the CURRENT index, so this is the one edit here
    // that can silently rewrite finished rounds.
    let impact = "";
    if (newHI !== oldHI && tournamentStarted)
      impact += "\n\nHandicaps are locked in for the tournament. Changing this index retroactively recalculates their net scores for ALL rounds — including finalized ones — and can reshuffle the leaderboard.";
    if (dirChanged) impact += newDir
      ? "\n\nA director can do everything in Admin: the roster, rounds, pairings, courses, tee times, settings, editions and the access password."
      : "\n\nThey keep their name and everything a player does — scores, skins, signatures. They lose the Admin tab.";

    if (!(await confirm({ title: "Confirm changes", message: changes.join("\n") + impact }))) return;

    await onSave({
      pid: editing.pid, name: newName, first, last, hi: newHI,
      hiChanged: newHI !== oldHI,
      dir: dirChanged ? { uid: theirMembership.id || theirMembership.uid, on: newDir } : null,
    });
    onClose();
  };

  // ── Move to inactive ──
  // The same write this has always done — the edition's roster row goes, the
  // player record stays — said as what it is. It was a 🗑 in danger red, which
  // is a promise of destruction the action never kept: a man taken off this
  // year's field keeps his career, his index and his sign-in, and the Players
  // tab already files him under "Inactive" rather than forgetting him. The red
  // trash can made a routine bit of new-year setup — two men not coming this
  // time — look like the button that erases fourteen years of golf.
  //
  // Destructive styling is kept for exactly one case: a player with holes
  // already posted. Taking him off the roster mid-tournament really does stop
  // those counting, and that is worth a red confirm and a nudge toward WD,
  // which is the action that keeps his card.
  const doDeactivate = async () => {
    const scored = Array.from({ length: numRounds }, (_, i) => i + 1)
      .map(r => ({ r, holes: holesEntered(holeData, editing.pid, r) }))
      .filter(x => x.holes > 0);
    const total = scored.reduce((n, s) => n + s.holes, 0);
    const msg = ["They come off this year's roster and move to Inactive on the Players tab."];
    if (total) msg.push("", `${total} scored hole${total === 1 ? "" : "s"} stay in the database (${scored.map(s => `Rd ${s.r}: ${s.holes}`).join(", ")}) but stop counting. If they started and quit, WD on the scoring screen is the better move — it keeps their card.`);
    msg.push("", "Their record, their index and their sign-in are untouched. Add them back any year from + Add player.");
    if (await confirm({
      title: `Move ${fullName(p) || p.name} to inactive?`,
      message: msg.join("\n"),
      confirmLabel: "Move to inactive",
      destructive: total > 0,
    })) {
      onRemove(editing.pid);
      onClose();
    }
  };

  return (
    <Popup onClose={onClose} maxWidth={420} padding={0} portal background={K.card} zIndex={3000} dismissOnBackdrop={false}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", borderBottom: `1px solid ${K.bdr}` }}>
        <div style={{ flex: 1, fontSize: FS.body, fontWeight: 800, color: K.t1 }}>{isNew ? "Add Player" : "Edit Player"}</div>
        <button onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, borderRadius: R.sm, border: `1px solid ${K.bdr}`, background: "transparent", color: K.t2, fontSize: FS.lead, cursor: "pointer", lineHeight: 1 }}>✕</button>
      </div>

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 11 }}>
        {/* ── Played before? ──
            First thing in the form, because it is the first decision: is this
            a man coming back, or a man who has never been here? Picking him
            answers the rest of the form as a side effect. */}
        {isNew && editing.linked && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
            borderRadius: R.sm, background: `${K.acc}${ALPHA.wash}`, border: `1px solid ${K.acc}${ALPHA.line}`,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: FS.small, fontWeight: 700, color: K.acc, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Returning · {editing.linked.name}
              </div>
              <div style={{ fontSize: FS.micro, color: K.t3, marginTop: 1 }}>
                Keeps their career, their index and their sign-in.
              </div>
            </div>
            <Btn variant="secondary" size="sm" style={{ color: K.t2, flexShrink: 0 }}
              onClick={() => set({ linked: null, first: "", last: "", nick: "", hi: "" })}>Change</Btn>
          </div>
        )}
        {showPicker && (
          <div>
            <span style={lbl}>Played before?</span>
            <div style={{ maxHeight: 168, overflowY: "auto", border: `1px solid ${K.bdr}`, borderRadius: R.sm }}>
              {returning.map((r, i) => (
                <button key={r.id} type="button" onClick={() => pickReturning(r)} style={{
                  width: "100%", textAlign: "left", cursor: "pointer", background: "transparent",
                  border: "none", borderBottom: i === returning.length - 1 ? "none" : `1px solid ${K.bdr}${ALPHA.hair}`,
                  padding: "8px 10px", display: "flex", alignItems: "center", gap: 8, fontFamily: FONT,
                }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: FS.small, fontWeight: 700, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.name}
                    </span>
                    <span style={{ display: "block", fontSize: FS.micro, color: K.t3, marginTop: 1 }}>
                      {returningLine(r)}
                    </span>
                  </span>
                  <span style={{ flexShrink: 0, fontSize: FS.small, fontWeight: 800, color: r.index == null ? K.t3 : K.acc }}>
                    {r.index == null ? "—" : r.index.toFixed(1)}
                  </span>
                </button>
              ))}
            </div>
            <div style={{ fontSize: FS.label, color: K.t3, marginTop: 5, lineHeight: 1.4 }}>
              Tap a name to bring them back with their record attached — typing it again can
              file them as a second player. Somebody new, fill in the boxes below.
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          {/* Not autofocused while the picker is up: on a phone the keyboard
              would slide over the list the director came here to read. */}
          <label style={{ flex: 1, minWidth: 0 }}><span style={lbl}>First name</span>
            <input autoFocus={!showPicker} value={editing.first} onChange={e => set({ first: e.target.value })} style={inp} /></label>
          <label style={{ flex: 1, minWidth: 0 }}><span style={lbl}>Last name</span>
            <input value={editing.last} onChange={e => set({ last: e.target.value })} style={inp} /></label>
        </div>

        {/* Nickname and Director paired on one row, like First/Last. */}
        <div style={{ display: "flex", gap: 8 }}>
          <label style={{ flex: 1, minWidth: 0 }}><span style={lbl}>Nickname</span>
            <input value={editing.nick} placeholder={defaultNick} onChange={e => set({ nick: e.target.value })} style={inp} /></label>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={lbl}>Director</span>
            <button type="button" disabled={!canGrantDirector} title={directorHint}
              onClick={() => set({ dir: !editing.dir })}
              style={{ fontSize: FS.body, fontWeight: 700, padding: "7px 10px", borderRadius: R.sm, cursor: canGrantDirector ? "pointer" : "default", width: "100%", boxSizing: "border-box", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: canGrantDirector ? 1 : 0.5,
                border: `1px solid ${editing.dir ? K.acc : K.bdr}`, background: editing.dir ? K.acc + ALPHA.wash : "transparent", color: editing.dir ? K.acc : K.t2 }}>
              {editing.dir ? "👑 Director" : "Player"}
            </button>
          </div>
        </div>
        {!canGrantDirector && (
          <div style={{ fontSize: FS.label, color: K.t3, marginTop: -6, lineHeight: 1.4 }}>{directorHint}</div>
        )}

        {/* No password field. There is ONE password and it belongs to the
            event, not to a player — Admin → Event → Event password. A
            per-player one was left over from the PIN login this app replaced
            with Google/Apple sign-in, and it read as though a director had to
            hand out twelve of them. */}
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={lbl}>Index</span>
            <input type="number" inputMode="decimal" step="0.1" value={editing.hi} placeholder={wbcRef ? String(wbcRef.index) : "0"} onChange={e => set({ hi: e.target.value })} style={inp} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={lbl}>WBC Index</span>
            {wbcRef ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: FS.lead, fontWeight: 800, color: K.acc }}>
                  {wbcRef.index.toFixed(1)}
                  {(wbcRef.stale || wbcRef.overridden) && <span style={{ color: K.warn }}>*</span>}
                </span>
                {wbcDiffers && (
                  <Btn size="sm" variant="secondary" onClick={() => set({ hi: String(wbcRef.index) })}>Use</Btn>
                )}
              </div>
            ) : (
              <div style={{ fontSize: FS.small, color: K.t3, paddingTop: 6 }}>no rounds yet</div>
            )}
          </div>
        </div>
        {wbcRef && wbcDiffers && (
          <div style={{ fontSize: FS.label, color: K.t3, lineHeight: 1.45, marginTop: -4 }}>
            This edition plays off <strong style={{ color: K.t1 }}>{(parseFloat(editing.hi) || 0).toFixed(1)}</strong>,
            not the {wbcRef.index.toFixed(1)} their record computes to. That override is what the Players tab shows
            in its year column.
          </div>
        )}
        {!isNew && tournamentStarted && (
          <div style={{ fontSize: FS.label, color: K.warn, lineHeight: 1.45 }}>
            The tournament has started — changing an index re-scores every round, including finalized ones.
          </div>
        )}

        {/* ── Status ──
            In the form rather than in the footer beside Cancel and Save,
            because it is not a form action: it does not wait for Save and it
            does not edit a field. It states where this man stands this year
            and offers the one move away from it. */}
        {!isNew && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            paddingTop: 11, borderTop: `1px solid ${K.bdr}${ALPHA.hair}`,
          }}>
            {/* "Active" alone, with no explaining clause after it: on a 360px
                phone the row is the button plus about 150px, and a sentence
                that ellipsises mid-word reads worse than the one word that
                fits. What it means is in the confirmation. */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={lbl}>Status</span>
              <div style={{ fontSize: FS.small, fontWeight: 700, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Active
              </div>
            </div>
            <Btn variant="secondary" size="sm" onClick={doDeactivate}
              title="Take them off this year's roster"
              style={{ flexShrink: 0, color: K.t2, whiteSpace: "nowrap" }}>
              Move to inactive
            </Btn>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderTop: `1px solid ${K.bdr}` }}>
        <span style={{ flex: 1 }} />
        <Btn variant="secondary" onClick={onClose} style={{ color: K.t2 }}>Cancel</Btn>
        <Btn onClick={doSave} style={{ paddingLeft: 20, paddingRight: 20 }}>{isNew ? "Add" : "Save"}</Btn>
      </div>
    </Popup>
  );
}

// ── ADMIN → SETTINGS → ACCESS ──
// The director's half of the door. Two things live here, and both of them are
// enforced by firestore.rules rather than by this screen:
//
//   • The tournament password (wbc_secrets/access). Only a director may read
//     or change it. SAVING IT BLANK TURNS THE REQUIREMENT OFF — the rules
//     treat a missing or empty code as an open door, which is the bootstrap
//     that makes the very first setup possible.
//
//   • Who is a director (`is_director` on each wbc_accounts document). This is
//     the ONLY flag the rules honour and the only thing the app reads to
//     decide whether the Admin tab exists, so the crown here and the access
//     behind it can never disagree.
//
// Two things the crown deliberately cannot do, both enforced by the rules:
// appoint somebody who has never been through the password screen (there is no
// membership document to flag), and change your own (nobody appoints
// themselves, and nobody steps down from inside the app — which means the last
// director can never leave the tournament unadministered). Stepping down is a
// console edit, and so is the FIRST director, since the rule requires one to
// already exist.
// ── ADMIN → SETTINGS → EVENT ──
// Tournament identity: the name and location shown in the app header and on
// the login screen. Ported from Bourbon Cup's Admin "Tournament" tab.
//
// Before this, both were baked into the TOURNAMENT constant at the top of this
// file, so renaming the event — or moving it to a different course town — was
// a code change and a redeploy. They are now a document, and the constant is
// the fallback used until one is saved.
//
// One card and one Save for both, because they are the same sentence on every
// screen that shows them ("WBC 2026 · Gaylord, MI"), and a director renaming
// the event for a new venue would otherwise have to remember two saves. An
// empty field falls back to its constant rather than saving blank, so the
// header can't end up with a hole in it.
// ── DateRangeCalendar ──────────────────────────────────────────────────────
// The event's dates, picked the way a hotel or airline picks them: tap the
// first day, tap the last, and the days between shade in as the stay.
//
// This replaces two <input type="date"> fields, which could not do the two
// things that matter here. They cannot shade anything — a four-day tournament
// looked like two unrelated dates — and the second one opens on TODAY'S month
// with no idea the first was just set, so picking Aug 26 then opening the end
// field put a director in February. One calendar has no second field to
// mis-open: after the first tap it is already on the right month, waiting for
// the second.
//
// Local ISO strings ("YYYY-MM-DD") throughout, never Date objects across a
// boundary: `new Date("2026-08-26")` parses as UTC midnight and renders as the
// 25th anywhere west of Greenwich, which is the classic way a tournament ends
// up a day early.
const MAX_EVENT_DAYS = 14;
// "Wed, Aug 26" -> "Wed 26". The month is the same for every day of a normal
// event, and dropping it is what fits a date under a round pill.
const chipDate = (iso, withMonth = false) =>
  withMonth ? fmtRoundDate(iso) : fmtRoundDate(iso).replace(/,?\s\w+\s(\d+)$/, " $1");
const isoOf = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const isoAddDays = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return isoOf(dt.getFullYear(), dt.getMonth(), dt.getDate());
};
// `mode="day"` picks a single date instead of a range — same grid, same month
// paging, one tap. It exists because the round's play date used to fall back to
// an <input type="date"> when the event had no dates set, and a native date
// field inside a modal is the worst place for one: iOS lays the control out to
// its own idea of a width, and tapping it raises the OS picker over a modal
// that dismisses on the touch behind it. The picker flashed and vanished, and
// the field ran off the side of the screen. Our own grid does neither.
function DateRangeCalendar({ start, end, onChange, mode = "range" }) {
  const day = mode === "day";
  // Which end of the range the next tap sets. Starting a NEW range whenever
  // both are set is what makes a mis-tap cheap: tap any day and you are picking
  // a fresh range, rather than having to clear something first.
  const [picking, setPicking] = useState(start && !end ? "end" : "start");
  // The month shown is DERIVED from the start date plus however far the
  // director has paged, not stored. That is what makes it follow the start date
  // the instant it is set — the whole point of one calendar is that the second
  // tap never has to go looking for the month — without an effect that writes
  // state during render.
  const [monthOffset, setMonthOffset] = useState(0);
  const anchor = start || localDateISO();
  const view = (() => {
    const [ay, am] = anchor.split("-").map(Number);
    const d = new Date(ay, am - 1 + monthOffset, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  })();

  const maxEnd = day ? null : (start ? isoAddDays(start, MAX_EVENT_DAYS - 1) : null);
  const tap = (iso) => {
    // One tap, one date, done — tapping the day already chosen clears it.
    if (day) { setMonthOffset(0); onChange(iso === start ? "" : iso, ""); return; }
    // Paging is relative to the start date, so once a tap moves the start the
    // offset has to go back to zero or the view jumps by however far they had
    // paged to reach the day they just tapped.
    setMonthOffset(0);
    // A tap before the start is a new start, not an invalid end — the reading
    // "actually, we begin earlier" is the common one.
    if (picking === "start" || !start || iso < start) {
      onChange(iso, "");
      setPicking("end");
      return;
    }
    if (maxEnd && iso > maxEnd) return;
    onChange(start, iso);
    setPicking("start");
  };

  const first = new Date(view.y, view.m, 1);
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const lead = first.getDay();
  const cells = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const shift = (n) => setMonthOffset(o => o + n);
  const monthLabel = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const today = localDateISO();

  const navBtn = { background: "transparent", border: `1px solid ${K.bdr}`, borderRadius: R.sm, color: K.t2, fontSize: FS.body, fontWeight: 700, width: 30, height: 28, cursor: "pointer", lineHeight: 1 };

  return (
    <div style={{ background: K.inp, borderRadius: R.md, border: `1px solid ${K.bdr}`, padding: "8px 10px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <button type="button" onClick={() => shift(-1)} style={navBtn}>‹</button>
        <span style={{ fontSize: FS.small, fontWeight: 800, color: K.t1 }}>{monthLabel}</span>
        <button type="button" onClick={() => shift(1)} style={navBtn}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, marginBottom: 2 }}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: FS.micro, fontWeight: 700, color: K.t3 }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const iso = isoOf(view.y, view.m, d);
          const isStart = iso === start;
          const isEnd = !day && iso === end;
          const between = !day && start && end && iso > start && iso < end;
          const beyond = picking === "end" && start && maxEnd && iso > maxEnd;
          const edge = isStart || isEnd;
          return (
            <button key={i} type="button" onClick={() => tap(iso)} disabled={beyond} style={{
              // Square in the middle, rounded at the ends: the band reads as one
              // stay rather than a row of separate days.
              height: 32, padding: 0, cursor: beyond ? "default" : "pointer", position: "relative",
              background: edge ? K.acc : between ? K.acc + ALPHA.tint : "transparent",
              color: edge ? ON_ACC : beyond ? K.t3 + ALPHA.line : between ? K.acc : K.t1,
              border: (!edge && !between && iso === today) ? `1px solid ${K.t3}` : "1px solid transparent",
              borderRadius: isStart && isEnd ? R.sm : isStart ? `${R.sm}px 0 0 ${R.sm}px` : isEnd ? `0 ${R.sm}px ${R.sm}px 0` : between ? 0 : R.sm,
              fontSize: FS.small, fontWeight: edge ? 800 : 600,
            }}>{d}</button>
          );
        })}
      </div>
      <div style={{ marginTop: 6, fontSize: FS.label, color: K.t3, textAlign: "center" }}>
        {day
          ? (start ? fmtRoundDate(start) : "Tap the day this round is played")
          : !start
          ? "Tap the first day of the tournament"
          : picking === "end"
            ? "Now tap the last day"
            : `${fmtRoundDate(start)}${end && end !== start ? ` → ${fmtRoundDate(end)}` : ""} · ${tournamentDays(start, end).length} day${tournamentDays(start, end).length === 1 ? "" : "s"}`}
      </div>
    </div>
  );
}

function TournamentPanel({ meta, onSave, notify, confirm, scoredRounds = [] }) {
  const [showEditions, setShowEditions] = useState(false);
  const [busy, setBusy] = useState(false);
  // The calendar opens on a tap and closes on Save. Closing on Save rather than
  // on the second date is deliberate: picking a range leaves the card dirty,
  // and folding the calendar away the moment the end date lands would hide the
  // change behind an un-tapped Save button.
  const [datesOpen, setDatesOpen] = useState(false);

  // One working copy rather than three useStates plus a hand-rolled string key
  // to decide when to re-seed them. useDirtyForm (ported from Bourbon Cup)
  // owns that: it syncs an incoming value into local state ONLY while the form
  // is clean, so a Firestore snapshot for an unrelated field of the same
  // tournament_state document can no longer wipe what the director is midway
  // through typing.
  const initialValue = useMemo(() => ({
    name: meta?.name || "",
    location: meta?.location || "",
    rounds: clampRounds(meta?.rounds),
    // The days the event runs. Typed once here and nowhere else: Rounds offers
    // exactly these days when a round is scheduled, so a round can only ever
    // land on a day the tournament is actually being played.
    startDate: meta?.startDate || "",
    endDate: meta?.endDate || "",
  }), [meta?.name, meta?.location, meta?.rounds, meta?.startDate, meta?.endDate]);

  // The hook's own save is what reconciles its clean snapshot. Routing the
  // panel's Save through it — rather than calling onSave directly and leaving
  // the hook holding a pre-save snapshot forever — is what keeps the
  // sync-when-clean behaviour alive for the NEXT external change.
  const { value: form, setValue: setForm, save: commit } = useDirtyForm({
    initialValue,
    onSave: async (v) => onSave({
      name: (v.name || "").trim() || TOURNAMENT.name,
      location: (v.location || "").trim(),
      rounds: v.rounds,
      startDate: v.startDate || "",
      // An end before the start is a half-typed range, not a range — keep the
      // start and let them finish, rather than saving something that yields no
      // days at all.
      endDate: (v.endDate && v.startDate && v.endDate < v.startDate) ? v.startDate : (v.endDate || ""),
    }),
  });
  const set = (patch) => setForm(prev => ({ ...prev, ...patch }));
  const { name, location, rounds, startDate, endDate } = form;

  const pendingName = (name || "").trim() || TOURNAMENT.name;
  const pendingLocation = (location || "").trim();
  // The Save light compares the NORMALISED pending values against the saved
  // document, not the hook's raw isDirty. Both answer "has this changed", but
  // only this one knows that trailing whitespace isn't a change — typing a
  // space and deleting it should not leave Save lit on a form that would write
  // the identical document.
  const dirty = pendingName !== (meta?.name || TOURNAMENT.name)
    || pendingLocation !== (meta?.location || "")
    || rounds !== clampRounds(meta?.rounds)
    || (startDate || "") !== (meta?.startDate || "")
    || (endDate || "") !== (meta?.endDate || "");

  // Rounds that already carry a score and would fall off the end of a shorter
  // tournament. Dropping to three does not DELETE round four — the holes stay
  // in the database and come back if the count goes back up — but nothing
  // counts them meanwhile, and a director who came here to fix a typo in the
  // location should hear that before they save it.
  const orphaned = scoredRounds.filter(r => r > rounds);

  const save = async () => {
    if (orphaned.length && confirm) {
      const ok = await confirm({
        title: `Play ${rounds} rounds?`,
        message: `Round ${orphaned.join(", ")} already ${orphaned.length === 1 ? "has" : "have"} scores, and a ${rounds}-round event stops counting ${orphaned.length === 1 ? "it" : "them"}.\n\nNothing is deleted — set the count back to ${Math.max(...orphaned)} and those rounds return.`,
        confirmLabel: `Play ${rounds}`,
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    await commit();
    setBusy(false);
    setDatesOpen(false);
    notify?.("Tournament details saved");
  };

  const label = { fontSize: FS.label, fontWeight: 700, color: K.t3, textTransform: "uppercase", letterSpacing: "0.06em" };
  const input = {
    flex: 1, minWidth: 0, boxSizing: "border-box", padding: "10px 12px",
    background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: R.sm,
    // 16px, not 13: iOS Safari zooms the page when a focused input is under
    // 16px and does not zoom back out on blur, stranding the director at 2x
    // on a form they still have to finish.
    color: K.t1, fontSize: FS.lead, fontWeight: 700, outline: "none",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* The same sheet the More menu opens, from the other door. This one is
          inside AdminView, which only a director renders, so it always
          manages. */}
      <EditionSwitcher open={showEditions} onClose={() => setShowEditions(false)} notify={notify} canManage />

      {/* Active edition — switch year or start a new one. First card on the
          tab because it decides which tournament everything BELOW it is
          editing; renaming the wrong year is the mistake this ordering
          prevents. */}
      <div>
        <div style={{ ...label, marginBottom: 8 }}>Active edition</div>
        <button onClick={() => setShowEditions(true)} style={{
          width: "100%", padding: "12px 14px", borderRadius: R.md,
          background: K.card, border: `1px solid ${K.bdr}`, color: K.t1,
          fontSize: FS.small, fontWeight: 700, letterSpacing: 0.3, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
        }}>
          <span>Edition · <span style={{ color: K.acc }}>{TOURNAMENT_ID}</span></span>
          <span style={{ fontSize: FS.label, color: K.t3, flexShrink: 0 }}>Open / clone a year ›</span>
        </button>
      </div>

      <div style={{ background: K.card, borderRadius: R.lg, border: `1px solid ${K.bdr}`, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <div style={label}>Tournament</div>
          <button onClick={save} disabled={!dirty || busy} style={{
            flexShrink: 0, fontSize: FS.label, fontWeight: 700, borderRadius: R.sm, padding: "8px 14px",
            color: dirty ? ON_ACC : K.t3,
            background: dirty ? K.acc : K.inp,
            border: dirty ? "none" : `1px solid ${K.bdr}`,
            cursor: dirty && !busy ? "pointer" : "default",
          }}>{busy ? "…" : "Save"}</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { key: "name", val: name, set: (v) => set({ name: v }), ph: TOURNAMENT.name, lbl: "Name" },
            { key: "location", val: location, set: (v) => set({ location: v }), ph: "e.g. Gaylord, MI", lbl: "Location" },
          ].map(f => (
            <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Fixed 58px gutter — the width of the longest label at this
                  size — so both inputs share a left edge. */}
              <span style={{ ...label, width: 58, flexShrink: 0 }}>{f.lbl}</span>
              <input value={f.val} onChange={e => f.set(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                placeholder={f.ph} style={input} />
            </div>
          ))}

          {/* How many rounds this year plays. Same card and the same Save as
              the name and location because it is the same question — "what is
              this event" — and it is answered once, at setup, before anybody
              tees off. Two choices rather than a number field: see
              ROUND_CHOICES up top. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ ...label, width: 58, flexShrink: 0 }}>Rounds</span>
            <div style={{ flex: 1, display: "flex", gap: 6 }}>
              {ROUND_CHOICES.map(n => {
                const on = rounds === n;
                return (
                  <Btn key={n} variant={on ? "primary" : "secondary"} onClick={() => set({ rounds: n })}
                    style={{ flex: 1, ...(on ? {} : { color: K.t2 }) }}>{n}</Btn>
                );
              })}
            </div>
          </div>

          {/* When it is played. Rounds turns these days into the list a round
              can be scheduled on, so nobody hand-types a date in the wrong
              month, or a Tuesday nobody is at the course.

              Closed, it is a field like the two above it, sharing their 58px
              gutter and reading back the range. Open, the label moves above and
              the month takes the full width — squeezed into that gutter, seven
              columns leave 35px targets. */}
          {!datesOpen ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ ...label, width: 58, flexShrink: 0 }}>Dates</span>
              <button type="button" onClick={() => setDatesOpen(true)} style={{
                ...input, textAlign: "left", cursor: "pointer", fontSize: FS.small,
                color: startDate ? K.t1 : K.t3,
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
              }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {startDate
                    ? `${fmtRoundDate(startDate)}${endDate && endDate !== startDate ? ` → ${fmtRoundDate(endDate)}` : ""}`
                    : "Set the tournament dates"}
                </span>
                <span style={{ fontSize: FS.label, fontWeight: 700, color: K.t3, flexShrink: 0 }}>
                  {startDate ? `${tournamentDays(startDate, endDate).length}d ›` : "›"}
                </span>
              </button>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <span style={label}>Dates</span>
                <button type="button" onClick={() => setDatesOpen(false)} style={{ background: "transparent", border: "none", color: K.t3, fontSize: FS.label, fontWeight: 700, cursor: "pointer", padding: 0 }}>Close</button>
              </div>
              <DateRangeCalendar start={startDate} end={endDate}
                onChange={(s, e) => set({ startDate: s, endDate: e })} />
            </div>
          )}
        </div>
        {orphaned.length > 0 && (
          <div style={{ fontSize: FS.label, fontWeight: 600, color: K.warn, marginTop: 8, lineHeight: 1.4 }}>
            Round {orphaned.join(", ")} already {orphaned.length === 1 ? "has" : "have"} scores — a {rounds}-round
            event stops counting {orphaned.length === 1 ? "it" : "them"}.
          </div>
        )}
      </div>
    </div>
  );
}

function AccessPanel({ notify, confirm }) {
  const [code, setCode] = useState("");
  const [revealed, setRevealed] = useState(false);
  // Distinct from `busy`: `loading` is the ONE read that happens on open, and
  // it is what stops the retry button flashing "Try again" before anything has
  // been tried.
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const reveal = async () => {
    setBusy(true); setErr("");
    const res = await readAccessCode();
    setBusy(false);
    // Three answers, and the third is why readAccessCode does not just return
    // a string: "no password set" and "I was not allowed to look" are the same
    // absence, and opposite instructions to the person reading this screen.
    if (!res.ok) { setErr(res.error); return; }
    setCode(res.code || "");
    setRevealed(true);
  };

  // Read it on open rather than behind a tap. The reveal button was guarding
  // against a shoulder over the screen, but this is a director-only tab and
  // the password's whole life is being said out loud across a table — while
  // the cost of hiding it was that the one field standing between a stranger
  // and somebody else's scorecard looked, to a director setting the event up,
  // like it wasn't there. The button stays as the retry when the read fails.
  //
  // Not a call to reveal(): that flips `busy` before it awaits anything, and a
  // setState in the same tick as the effect is a cascading render. Everything
  // here happens after the await, so the first paint is the `loading` one.
  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await readAccessCode();
      if (!alive) return;
      setLoading(false);
      if (!res.ok) { setErr(res.error); return; }
      setCode(res.code || "");
      setRevealed(true);
    })();
    return () => { alive = false; };
  }, []);

  const save = async () => {
    const next = (code || "").trim();
    // Ported from Bourbon Cup: taking the password OFF is a one-tap action
    // with no undo that opens the tournament to anyone with a Google account,
    // and it is one keystroke away from a normal edit. Ask first, and say
    // which of the two things is about to happen.
    if (confirm) {
      const ok = await confirm({
        title: next ? "Change the password?" : "Remove the password?",
        message: next
          ? `Anyone signing in from now on needs "${next}" before they can claim a name or post a score.\n\nNobody already through the door is affected — this does not sign anybody out.`
          : "Anybody who signs in with Google or Apple will be able to claim a name and post scores.",
        confirmLabel: next ? "Change it" : "Remove it",
        destructive: !next,
      });
      if (!ok) return;
    }
    setBusy(true); setErr("");
    const res = await setAccessCode(code);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    notify?.(next ? "Password saved" : "Password cleared — anyone can sign in");
  };

  const label = { fontSize: FS.label, fontWeight: 700, color: K.t3, textTransform: "uppercase", letterSpacing: "0.06em" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* The password */}
      <div style={{ background: K.card, borderRadius: R.lg, border: `1px solid ${K.bdr}`, padding: "12px 14px" }}>
        <div style={{ ...label, marginBottom: 8 }}>Event password</div>
        {revealed ? (
          <div style={{ display: "flex", gap: 8 }}>
            <input value={code} onChange={e => { setCode(e.target.value); if (err) setErr(""); }}
              type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              placeholder="No password set"
              style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: R.md, background: K.inp, border: `1px solid ${K.bdr}`, color: K.t1, fontSize: FS.lead, fontWeight: 700, outline: "none", fontFamily: "'Montserrat', sans-serif", boxSizing: "border-box" }} />
            <Btn onClick={save} disabled={busy} style={{ flexShrink: 0 }}>
              {busy ? "…" : "Save"}
            </Btn>
          </div>
        ) : (
          <button onClick={reveal} disabled={loading || busy} style={{ padding: "9px 16px", borderRadius: R.md, background: "transparent", border: `1px solid ${K.acc}${ALPHA.line}`, color: K.acc, fontSize: FS.small, fontWeight: 700, cursor: loading || busy ? "default" : "pointer" }}>
            {loading || busy ? "Reading…" : "Try again"}
          </button>
        )}
        {revealed && !(code || "").trim() && (
          <div style={{ fontSize: FS.label, fontWeight: 600, color: K.warn, marginTop: 8 }}>
            No password set — anyone with a Google or Apple account can sign in and claim a name.
          </div>
        )}
      </div>

      {err && <div style={{ fontSize: FS.label, fontWeight: 600, color: K.danger, lineHeight: 1.5 }}>{err}</div>}
    </div>
  );
}

function AdminView({ activePlayers, rosterPlayers, sideGames, onUpdateSideGames, rebuyIds, tournament, tPlayers, tRounds, courses, setCourseForRound, addCourse, addPlayerToTournament, updateHI, updateName, removePlayer, pairingsData, setPairings, teeData, setTeeBulk, teeTimesData, setTeeTimesData, roundDates, onSetRoundDate, scoringOpen, onSetScoringOpen, pairingStrategy, onSetPairingStrategy, leaderboard, holeData, finalizedRounds, onFinalizeRound, onUnfinalizeRound, onDiscardRoundScores, notify, getPlayerTee, startFresh, externalSettingsOpen, externalSettingsTab, externalSettingsRound, onExternalSettingsHandled, teesSaved, onTeesSave, teesModified, onTeesModify, memberships, onSetDirector, claims, authUid, tournamentMeta, onSaveTournamentMeta }) {
  const [tab, setTab] = useState("rounds");
  // Themed confirmations (see lib/useConfirm). The host <ConfirmModal/> is
  // rendered once at the bottom of this view; `confirm(...)` returns a
  // Promise<boolean>.
  const { confirm, confirmModal } = useConfirm();
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  // ── Handicap-edit guard ──
  // Handicap indexes are LOCKED-IN for the tournament by design (unlike a rolling
  // league handicap). Because getLeaderboard reads the CURRENT handicap_index for
  // every round, editing an HI after play has started retroactively recalculates
  // that player's net scores for ALL rounds — including finalized ones — and can
  // reshuffle the leaderboard. Finalization locks score entry, not this input.
  // So: once the tournament has started (any real hole score exists, or any round
  // is finalized), an HI edit must pass through an explicit warning confirmation.
  const tournamentStarted = useMemo(() =>
    Object.values(finalizedRounds || {}).some(Boolean) ||
    Object.values(holeData || {}).some(scores =>
      Object.values(scores || {}).some(s => s > 0 && s !== 99)
    ),
  [holeData, finalizedRounds]);
  // Which rounds already have a real score on them, ascending. Read only by
  // the Rounds control on the Event tab, which warns before a director shortens
  // the tournament past a round somebody has already played.
  const scoredRounds = useMemo(() => {
    const seen = new Set();
    Object.entries(holeData || {}).forEach(([key, scores]) => {
      if (!Object.values(scores || {}).some(s => s > 0 && s !== WD_SCORE)) return;
      const rnd = parseInt(key.split("_").pop(), 10);
      if (rnd > 0) seen.add(rnd);
    });
    return [...seen].sort((a, b) => a - b);
  }, [holeData]);

  // The handicap-lock warning used to be a bespoke popup raised from an
  // inline index edit on the roster row. Editing moved into PlayerEditor,
  // which folds the same warning into its own change confirmation — one
  // dialog listing every pending change, rather than a second one behind it.
  // `tournamentStarted` is still read: the editor takes it as a prop.
  // Deep links from elsewhere in the app (the scoring screen's "no course
  // assigned" prompt). These used to open the gear modal on a given pane;
  // with the modal gone they select a top-level tab instead. The old pane
  // names are mapped rather than changed at the call sites, so a caller
  // asking for "course" still lands somewhere sensible.
  const EXTERNAL_TAB = { course: "rounds", players: "players", access: "event", tournament: "event" };
  const [editingPlayer, setEditingPlayer] = useState(null); // { pid, first, last, nick, hi, dir } | { isNew: true, linked, ... }

  // Who could be added back — the player registry plus the record books, minus
  // this edition's roster. Keyed off tPlayers, which is also what a registry
  // refresh nudges, so a name added on another phone reaches this list.
  const returningPool = useMemo(
    () => returningPlayers({ registry: DEMO_PLAYERS, rosterIds: tPlayers.map(t => t.player_id) }),
    [tPlayers],
  );
  const [confirmCourse, setConfirmCourse] = useState(null);
  const [courseSearch, setCourseSearch] = useState("");
  const [courseStateFilter, setCourseStateFilter] = useState("MI");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const roundStripRef = useRef(null);
  // Course-editor refetch: { busy, msg }.
  const [refetch, setRefetch] = useState({ busy: false, msg: "" });
  // Which round has its day list open, if any — the pill's date field sets it.
  const [datePickRound, setDatePickRound] = useState(null);
  // Is the course card showing its search instead of its course? Forced open
  // when the round has no course — there is nothing else for the card to be.
  const [pickingCourse, setPickingCourse] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null); // { courseId, draft: {...} }
  const [manualCourse, setManualCourse] = useState(null); // null | draft object when manually adding
  const [coursePreview, setCoursePreview] = useState(null); // course to preview before confirming add
  const [localDbPrompt, setLocalDbPrompt] = useState(null); // { sbCourse, query } — prompt user to use local or fetch fresh
  const [editRound, setEditRound] = useState(() => { for (let r = 1; r <= NUM_ROUNDS; r++) { if (!finalizedRounds[r]) return r; } return NUM_ROUNDS; });
  // Keep editRound pointing at the active round when finalization state changes
  useEffect(() => {
    setEditRound(r => {
      if (!finalizedRounds[r]) return r;
      for (let i = 1; i <= NUM_ROUNDS; i++) { if (!finalizedRounds[i]) return i; }
      return NUM_ROUNDS;
    });
  }, [JSON.stringify(finalizedRounds)]);
  // Keep the selected round on screen when something OTHER than a tap moves it
  // — finalizing advances the round, and scoring's "no course" link jumps to
  // one — which matters once the strip is wide enough to scroll sideways.
  useEffect(() => {
    const el = roundStripRef.current?.querySelector(`[data-round="${editRound}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [editRound]);
  useEffect(() => {
    if (!externalSettingsOpen) return;
    setTab(EXTERNAL_TAB[externalSettingsTab] || "rounds");
    // Course setup is per-round and now lives in the Rounds tab, so a link that
    // named a round has to select it — otherwise "no course for Round 3" drops
    // you on Round 1's setup and the fix looks like it did nothing.
    if (externalSettingsRound) setEditRound(externalSettingsRound);
    if (onExternalSettingsHandled) onExternalSettingsHandled();
  }, [externalSettingsOpen]);
  const [finalizeModal, setFinalizeModal] = useState(null); // { round, scores[], missing[] }

  // On mount, check if any round is ready to finalize and show popup
  const buildFinalizeModal = (r) => {
    const tr = tRounds.find(t => t.round_number === r);
    const course = tr ? courses.find(c => c.id === tr.course_id) : null;
    const scores = activePlayers.map(p => {
      const key = `${p.id}_${r}`;
      const s = holeData[key] || {};
      const tee = getPlayerTee(r, p.id, course);
      const slope = tee?.slope || course?.slope || 113;
      const rating = tee?.rating || course?.rating || 72;
      const par = tee?.par || course?.par || 72;
      const ch = calcCH(p.handicap_index, slope, rating, par);
      const holePars = course?.hole_pars || [];
      let gross = 0, netToPar = 0;
      for (let h = 0; h < 18; h++) {
        if (s[h] > 0) { gross += s[h]; netToPar += s[h] - (holePars[h] || 4); }
      }
      netToPar -= ch;
      return { id: p.id, name: p.name, gross, netToPar };
    }).sort((a, b) => a.netToPar - b.netToPar);
    const missing = activePlayers.filter(p => {
      const wdTp = tPlayers.find(tp => tp.player_id === p.id);
      if (wdTp?.status === "WD") return false; // WD players not flagged as missing
      const s = holeData[`${p.id}_${r}`] || {};
      for (let h = 0; h < 18; h++) { if (!(s[h] > 0)) return true; }
      return false;
    }).map(p => p.name);
    return { round: r, course, scores, missing };
  };

  useEffect(() => {
    for (let r = 1; r <= (tournament?.num_rounds || NUM_ROUNDS); r++) {
      if (finalizedRounds[r]) continue;
      // Check if all groups for this round have been finalized by scoring groups
      const roundGroups = (pairingsData || {})[r] || [];
      const allGroupsFinalized = roundGroups.length > 0 && roundGroups.every(grp => {
        const key = `${r}_${grp.slice().sort().join(",")}`;
        return finalizedRounds[key];
      });
      // Also check if all players have all 18 holes filled
      const allHolesDone = activePlayers.length > 0 && activePlayers.every(p => {
        const scores = holeData[`${p.id}_${r}`] || {};
        for (let h = 0; h < 18; h++) { if (!(scores[h] > 0)) return false; }
        return true;
      });
      if (allGroupsFinalized || allHolesDone) {
        setFinalizeModal(buildFinalizeModal(r));
        break;
      }
    }
  }, []);

  const ac = K.acc;
  const acGlow = K.accGlow;

  // Search GolfCourseAPI - debounced
  const searchTimerRef = useRef(null);
  const doCourseSearch = (query, stateOverride) => {
    setCourseSearch(query);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!query.trim() || query.trim().length < 2) { setSearchResults([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      const stateFilter = stateOverride !== undefined ? stateOverride : courseStateFilter;
      try {
        const q = query.trim();
        const stateParam = stateFilter ? `&state=${encodeURIComponent(stateFilter)}` : "";
        let results = [];


        // 1. Firestore FIRST — local WBC history takes priority
        let sbCourseNames = new Set();
        try {
          const qLower = q.toLowerCase();
          const rows = await db.get("courses");
          if (rows?.length) {
            const filtered = rows.filter(r => {
              const nameMatch = (r.name || "").toLowerCase().includes(qLower);
              const cityMatch = (r.city || "").toLowerCase().includes(qLower);
              const stateOk = stateFilter ? stateMatches(r.state, stateFilter) : true;
              return (nameMatch || cityMatch) && stateOk;
            }).slice(0, 40);
            const courseIds = filtered.map(r => r.id).filter(Boolean);
            const tbRows = courseIds.length
              ? await db.get("tee_boxes", [{ field: "course_id", op: "in", value: courseIds }])
              : [];
            const sbCourses = filtered.map((c) => ({
              ...c, hole_pars: c.hole_pars || [], hole_handicaps: c.hole_handicaps || [],
              _source: "WBC History",
              tee_boxes: (tbRows || []).filter(t => t.course_id === c.id).map((t, ti) => {
                const tbSlope = parseInt(t.slope), courseSlope = parseInt(c.slope);
                const slope = (tbSlope === 113 && courseSlope && courseSlope !== 113) ? courseSlope : t.slope;
                return { ...t, slope, color: resolveTeeColor(t, ti) };
              }),
            }));
            for (const sbC of sbCourses) {
              results.push(sbC);
              sbCourseNames.add(sbC.name.toLowerCase());
            }
          }
        } catch(e) { console.log("[Firestore] failed:", e); }

        // 2. RapidAPI — only for courses NOT already in local DB
        let apiResults = [];
        try {
          const r = await fetch(`/api/courses2?search=${encodeURIComponent(q)}${stateParam}`);
          if (r.ok) {
            const data = await r.json();
            const raw = Array.isArray(data) ? data : (data.courses || data.data || []);
            apiResults = parseRapidAPI(raw, stateFilter).filter(c => !sbCourseNames.has(c.name.toLowerCase()));
            results = [...results, ...apiResults];
          }
        } catch(e) { console.log("[RapidAPI] failed:", e); }

        // 3. GolfCourseAPI — fill gaps not covered by Firestore or RapidAPI
        try {
          const r2 = await fetch(`/api/courses?search=${encodeURIComponent(q)}${stateParam}`);
          if (r2.ok) {
            const data2 = await r2.json();
            const gcParsed = parseGolfCourseAPI(data2);
            for (const gc of gcParsed) {
              if (!stateMatches(gc.state, stateFilter)) continue;
              const nameLower = gc.name.toLowerCase();
              if (sbCourseNames.has(nameLower)) continue; // already have local version
              const rapidMatch = results.find(r => r.name.toLowerCase() === nameLower);
              if (rapidMatch) {
                const rapidReal = hasRealSlope(rapidMatch), gcReal = hasRealSlope(gc);
                if (gcReal && !rapidReal) {
                  results = results.map(r => r.name.toLowerCase() === nameLower
                    ? { ...rapidMatch, tee_boxes: gc.tee_boxes, slope: gc.slope, rating: gc.rating } : r);
                }
              } else {
                results.push(gc);
              }
            }
          }
        } catch(e) { console.log("[GolfCourseAPI] failed:", e); }

        // 4. Flag courses where neither API had real data
        results = results.map(c => ({ ...c, _incompleteData: !hasRealSlope(c) }));

        setSearchResults(results);
      } catch (err) {
        console.log("Course search failed:", err);
        setSearchResults([]);
      }
      setSearchLoading(false);
    }, 400);
  };

  const addCourseToLibrary = (c) => {
    addCourse(c);
    // Clear the query: what you want to see next is your course list with the
    // new course in it, not the results you just finished with.
    setCourseSearch("");
    setSearchResults([]);
    setManualCourse(null);
    // You searched from inside a round's setup, so an empty round is asking for
    // this course. Only fill an EMPTY one — never silently move a round the
    // director already assigned — and say so, since the assignment is the part
    // that is easy to miss.
    const roundTaken = !!tRounds.find(t => t.round_number === editRound && t.course_id);
    if (!roundTaken && !finalizedRounds[editRound]) {
      setCourseForRound(editRound, c);
      setPickingCourse(false);
      notify(`${c.name} added — Round ${editRound} is set`);
    } else {
      notify(`${c.name} added to your courses`);
    }
  };
  const numRounds = tournament?.num_rounds || NUM_ROUNDS;

  // ── Single source of truth for round setup completion ──
  // Every place that shows "is this round ready?" (round cards, sub-tab dots,
  // the needs-setup banner) derives from this one function so the definition
  // of "done" lives in exactly one spot.
  const getRoundStatus = (r) => {
    const tr = tRounds.find(t => t.round_number === r);
    const course = tr ? courses.find(c => c.id === tr.course_id) : null;
    const hasCourse = !!course;
    const groups = (pairingsData || {})[r] || [];
    const teeTimes = (teeTimesData[r] || []);
    const hasPlayers = activePlayers.length > 0;
    // Who has no tee for this round — the ids, not just a yes/no, because the
    // console names them. One definition, in lib/roundSetup, so the warning
    // banner, the round pill and the nav dot cannot disagree about who is
    // missing; it also catches an assignment pointing at a tee the course no
    // longer has, which resolves to nothing exactly as a blank does.
    const noTee = hasCourse && hasPlayers
      ? missingTees({ players: activePlayers, assignments: teeData[r] || {}, teeNames: (course.tee_boxes || []).map(t => t.name) })
      : [];
    const allTees = hasPlayers && noTee.length === 0;
    const groupsDone = groups.length > 0 && groups.flat().length === activePlayers.length;
    const teeTimesDone = groups.length > 0 && groups.every((_, gi) => teeTimes[gi] && teeTimes[gi].trim() !== "");
    const teesDone = hasCourse && !!teesSaved[r] && !teesModified[r] && allTees;
    const pairingsDone = hasCourse && groupsDone && teeTimesDone;
    return {
      round: r, course, hasCourse, allTees, noTee, groupsDone, teeTimesDone,
      teesDone, pairingsDone,
      allDone: hasCourse && teesDone && pairingsDone,
      finalized: !!finalizedRounds[r],
    };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 0 auto" }}>

      {/* Finalize round popup modal */}
      {finalizeModal && (
        <div style={{ position: "fixed", top: 0, bottom: 0, left: 0, right: 0, background: SCRIM, zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto" }}>
          <div style={{ background: K.card, borderRadius: R.xl, border: `1px solid ${K.bdr}`, width: "100%", maxWidth: 420, overflow: "hidden", marginTop: "auto", marginBottom: "auto" }}>
            {/* Header */}
            <div style={{ background: K.gold + ALPHA.wash, borderBottom: `1px solid ${K.gold}${ALPHA.hair}`, padding: "14px 16px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: FS.lead }}>⚡</span>
              <div>
                <div style={{ fontSize: FS.body, fontWeight: 800, color: K.gold }}>Round {finalizeModal.round} Complete</div>
                <div style={{ fontSize: FS.label, color: K.t3 }}>{finalizeModal.course?.name || "Review scores before finalizing"}</div>
              </div>
            </div>
            {/* Column headers */}
            <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 56px 56px", padding: "6px 16px", borderBottom: `1px solid ${K.bdr}`, background: K.inp }}>
              <span style={{ fontSize: FS.micro, color: K.t3, textTransform: "uppercase" }}>#</span>
              <span style={{ fontSize: FS.micro, color: K.t3, textTransform: "uppercase" }}>Player</span>
              <span style={{ fontSize: FS.micro, color: K.t3, textTransform: "uppercase", textAlign: "center" }}>Net</span>
              <span style={{ fontSize: FS.micro, color: K.t3, textTransform: "uppercase", textAlign: "center" }}>Gross</span>
            </div>
            {/* Net scores list */}
            <div style={{ padding: "8px 0" }}>
              {finalizeModal.scores.map((p, i) => {
                // Compute tied positions
                const tiedAbove = i > 0 && finalizeModal.scores[i-1].netToPar === p.netToPar;
                const tiedBelow = i < finalizeModal.scores.length - 1 && finalizeModal.scores[i+1].netToPar === p.netToPar;
                const isTied = tiedAbove || tiedBelow;
                let pos = i + 1;
                if (tiedAbove) { let j = i - 1; while (j >= 0 && finalizeModal.scores[j].netToPar === p.netToPar) j--; pos = j + 2; }
                const posLabel = isTied ? `T${pos}` : `${pos}`;
                return (
                  <div key={p.id} style={{ display: "grid", gridTemplateColumns: "32px 1fr 56px 56px", alignItems: "center", padding: "7px 12px", margin: "3px 8px", borderRadius: R.sm, border: `1px solid ${K.bdr}`, background: K.card }}>
                    <span style={{ fontSize: FS.label, fontWeight: 700, color: pos === 1 && !tiedAbove ? K.acc : K.t3 }}>{posLabel}</span>
                    <span style={{ fontSize: FS.small, fontWeight: 600, color: K.t1 }}>{p.name}</span>
                    <span style={{ fontSize: FS.small, fontWeight: 800, textAlign: "center", color: p.netToPar < 0 ? K.under : p.netToPar > 0 ? K.t2 : K.t1 }}>
                      {p.netToPar === 0 ? "E" : p.netToPar > 0 ? `+${p.netToPar}` : p.netToPar}
                    </span>
                    <span style={{ fontSize: FS.label, textAlign: "center", color: K.t3 }}>{p.gross > 0 ? p.gross : "—"}</span>
                  </div>
                );
              })}
            </div>
            {/* Missing scores warning */}
            {finalizeModal.missing.length > 0 && (
              <div style={{ padding: "8px 16px", background: K.warn + ALPHA.wash, borderTop: `1px solid ${K.warn}${ALPHA.tint}` }}>
                <span style={{ fontSize: FS.label, color: K.warn }}>⚠️ Missing scores: {finalizeModal.missing.join(", ")}</span>
              </div>
            )}
            {/* Actions */}
            <div style={{ display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${K.bdr}` }}>
              <button onClick={() => setFinalizeModal(null)} style={{
                flex: 1, padding: "10px 0", borderRadius: R.md, background: K.inp, border: `1px solid ${K.bdr}`,
                color: K.t2, fontSize: FS.small, fontWeight: 600, cursor: "pointer",
              }}>Review Later</button>
              <button onClick={() => { onFinalizeRound(finalizeModal.round); if (finalizeModal.round < numRounds) { setEditRound(finalizeModal.round + 1); setTab("rounds"); } setFinalizeModal(null); }} style={{
                flex: 1, padding: "10px 0", borderRadius: R.md,
                background: finalizeModal.missing.length > 0 ? K.warn : K.acc,
                border: "none", color: K.bg, fontSize: FS.small, fontWeight: 700, cursor: "pointer",
              }}>{finalizeModal.missing.length > 0 ? "Finalize Anyway" : "✓ Finalize Round"}</button>
            </div>
          </div>
        </div>
      )}


      {/* ── Top-level tabs ──────────────────────────────────────────
          Five always-visible tabs, replacing the round-selector + sub-tabs
          + gear-modal shell. Ported from Bourbon Cup's Admin, whose console
          is one flat set of tabs rather than a round-scoped view with
          everything else hidden behind a gear.

          Pinned in a StickyTop so the bar lands in the SAME place on every
          tab regardless of that tab's content height — see ui.jsx. */}
      <StickyTop padBottom={10}>
        <SegmentedToggle
          options={[["players","Players"],["rounds","Rounds"],["betting","Betting"],["event","Event"]]}
          value={tab}
          onChange={setTab}
        />
      </StickyTop>

      {/* The round selector belongs to the two ROUND-SCOPED tabs only.
          Players, Courses and Event act on the tournament as a whole, and a
          round picker above them would imply otherwise. */}
      {tab === "rounds" && (<>
        {(() => {
          const _finalizePending = Object.entries(pairingsData || {}).some(([rnd, groups]) => {
            if (!groups.length) return false;
            return groups.every(grp => {
              const gk = `${rnd}_${grp.slice().sort().join(",")}`;
              if (finalizedRounds[gk] || finalizedRounds[parseInt(rnd)]) return false;
              return grp.every(pid => {
                const pd = holeData[`${pid}_${rnd}`] || {};
                return Object.values(pd).filter(s => s > 0).length === 18;
              });
            });
          });
          if (!_finalizePending) return null;
          return (
            <button onClick={() => setShowFinalizeModal(true)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "10px 14px", borderRadius: R.md, marginBottom: 10, background: K.warn, border: "none", color: ON_ACC, fontSize: FS.small, fontWeight: 800, cursor: "pointer", letterSpacing: "0.01em" }}>
              <span style={{ fontSize: FS.lead }}>🏆</span>Round ready to finalize — tap to close out
            </button>
          );
        })()}

      {/* Round pills, each with its own date under it.

          The date used to be one row of every day the tournament runs, shading
          the one this round plays: four days on screen to say one thing about
          one round, and the same four again when you moved to the next round.
          Now each round shows its own date and only its own — as many dates as
          there are rounds — under the pill it belongs to. Tapping one selects
          that round and opens the day list for it, so the full set of days is
          on screen only while a date is actually being chosen. */}
      {/* Four rounds share the width evenly. Beyond that they would be too
          narrow to read a date under, so the strip switches to fixed-width
          columns and scrolls sideways instead — the round count is a setting,
          and this is what happens when it grows past what a phone fits. */}
      <div ref={roundStripRef} className={numRounds > 4 ? "wbc-hscroll" : undefined}
        style={{
          display: "flex", gap: 4, marginBottom: 10, alignItems: "stretch",
          ...(numRounds > 4 ? { overflowX: "auto", overflowY: "hidden", paddingBottom: 2 } : {}),
        }}>
        {Array.from({ length: numRounds }, (_, i) => i + 1).map(r => {
          const st = getRoundStatus(r);
          const isFinal = st.finalized;
          const isActive = editRound === r;
          const teesDone = st.teesDone;
          const pairingsDone = st.pairingsDone;
          const rDate = (roundDates || {})[r];
          return (
            <div key={r} data-round={r} style={{ flex: numRounds > 4 ? "0 0 78px" : 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            <button onClick={() => setEditRound(r)} style={{
              width: "100%", padding: "7px 4px 6px", borderRadius: R.md, cursor: "pointer",
              background: isActive ? acGlow : K.card,
              border: `${isActive ? "2px" : "1px"} solid ${isActive ? ac : isFinal ? K.bdr + ALPHA.tint : K.bdr + ALPHA.line}`,
              color: isFinal ? K.t3 : isActive ? ac : K.t2,
              opacity: isFinal && !isActive ? 0.4 : 1,
              transition: `all ${MOTION}`,
            }}>
              <div style={{ fontSize: FS.label, fontWeight: isActive ? 700 : 500, marginBottom: 3 }}>
                {isFinal ? "🔒 " : ""}Rd {r}
              </div>
              {isFinal ? (
                <div style={{ fontSize: FS.micro, color: K.t3 }}>Final</div>
              ) : (
                <div style={{ display: "flex", justifyContent: "center", gap: 4 }}>
                  {/* Two states of not-done, drawn differently. Tees that are
                      merely unsaved are a step the director has not reached
                      yet; a player with NO tee is a fault that will produce a
                      wrong course handicap, so it gets the filled red dot
                      rather than the outline everything-else-pending wears. */}
                  {[["T", teesDone, st.noTee.length > 0], ["P", pairingsDone, false]].map(([lbl, done, fault]) => (
                    <div key={lbl} style={{
                      display: "flex", alignItems: "center", gap: 2,
                      fontSize: FS.micro, fontWeight: 700,
                      color: done ? K.ok : fault ? K.danger : K.danger + ALPHA.panel,
                    }}>
                      <div style={{
                        width: 5, height: 5, borderRadius: "50%",
                        background: done ? K.ok : fault ? K.danger : "transparent",
                        border: `1px solid ${done ? K.ok : fault ? K.danger : K.danger + ALPHA.line}`,
                      }} />
                      {lbl}
                    </div>
                  ))}
                </div>
              )}
            </button>
            {onSetRoundDate && (
              isFinal
                ? <div style={{ fontSize: FS.micro, fontWeight: 700, color: K.t3, textAlign: "center", padding: "3px 0", opacity: isActive ? 1 : 0.4 }}>{rDate ? chipDate(rDate) : "—"}</div>
                : <button onClick={() => { setEditRound(r); setDatePickRound(r); }} style={{
                    width: "100%", padding: "4px 2px", borderRadius: R.sm, cursor: "pointer",
                    background: rDate ? ac  + ALPHA.wash : "transparent",
                    border: `1px solid ${rDate ? ac  + ALPHA.hair : K.warn + ALPHA.line}`,
                    color: rDate ? ac : K.warn,
                    fontSize: FS.micro, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{rDate ? chipDate(rDate) : "+ date"}</button>
            )}
            </div>
          );
        })}
      </div>

        {/* The day list, for ONE round, only while it is being chosen. The
            choices are the days the tournament runs — typed once in Admin →
            Event — because every round of a four-day event is one of those
            four days, and a free date field is how a round ends up scheduled
            in the wrong month. Two rounds CAN share a day: 36-hole days are
            normal, so a day another round already uses is marked, not blocked.
            No dates on the event yet: a plain date field, so nothing that
            worked before stops working. */}
        {datePickRound != null && (() => {
          const r = datePickRound;
          const days = tournamentDays(tournamentMeta?.startDate, tournamentMeta?.endDate);
          const mine = (roundDates || {})[r] || "";
          // A date set before the event dates were (or after they moved) still
          // shows, as its own chip — otherwise the round would look unscheduled
          // while the leaderboard and the scoring gate use it.
          const chips = days.includes(mine) || !mine ? days : [...days, mine];
          const pick = (d) => { onSetRoundDate(r, d); setDatePickRound(null); };
          return (
            <Popup onClose={() => setDatePickRound(null)} maxWidth={340} portal>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: FS.label, fontWeight: 800, color: K.t1, textTransform: "uppercase", letterSpacing: "0.05em" }}>Round {r} · play date</span>
                <button onClick={() => setDatePickRound(null)} style={{ background: "transparent", border: "none", color: K.t3, fontSize: FS.lead, cursor: "pointer", lineHeight: 1 }}>✕</button>
              </div>
              {chips.length === 0 ? (
                <>
                  <DateRangeCalendar mode="day" start={mine} end="" onChange={(d) => pick(d)} />
                  <div style={{ fontSize: FS.label, color: K.t3, marginTop: 8, lineHeight: 1.5 }}>
                    Set the tournament dates in Event and this becomes a list of the days it runs.
                  </div>
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {chips.map(d => {
                    const on = mine === d;
                    const others = Object.entries(roundDates || {})
                      .filter(([rr, v]) => v === d && Number(rr) !== r)
                      .map(([rr]) => Number(rr))
                      .sort((a, b) => a - b);
                    return (
                      <button key={d} onClick={() => pick(on ? "" : d)} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                        padding: "10px 12px", borderRadius: R.md, cursor: "pointer",
                        background: on ? ac : K.inp,
                        border: `1px solid ${on ? ac : K.bdr}`,
                        color: on ? ON_ACC : K.t1, fontSize: FS.small, fontWeight: 700,
                      }}>
                        <span>{chipDate(d, true)}</span>
                        <span style={{ fontSize: FS.label, fontWeight: 700, color: on ? ON_ACC : K.t3 }}>
                          {on ? "✓ this round" : others.length ? `also R${others.join(", R")}` : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </Popup>
          );
        })()}

      </>)}


              {tab === "event" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <TournamentPanel meta={tournamentMeta} onSave={onSaveTournamentMeta} notify={notify}
                    confirm={confirm} scoredRounds={scoredRounds} />
                  <AccessPanel notify={notify} confirm={confirm} />
                </div>
              )}
              {tab === "players" && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                    <SectionLabel style={{ marginBottom: 0 }}>Roster ({activePlayers.length})</SectionLabel>
                    <Btn size="sm" onClick={() => setEditingPlayer({ isNew: true, first: "", last: "", nick: "", hi: "", dir: false })}>
                      + Add player
                    </Btn>
                  </div>
                  <Card pad={0} style={{ overflow: "hidden" }}>
                    {activePlayers.length === 0 && (
                      <div style={{ padding: "18px 14px", textAlign: "center", fontSize: FS.small, color: K.t3, lineHeight: 1.5 }}>
                        Nobody on the roster yet. Add the field here — everything else in this
                        console (tees, pairings, scoring) works off it.
                      </div>
                    )}
                    {[...activePlayers].sort((a,b) => a.name.localeCompare(b.name)).map((p, i) => (
                      <PlayerRow
                        key={p.id}
                        player={p}
                        isLast={i === activePlayers.length - 1}
                        isDirector={playerIsDirector(memberships, claims, p.id)}
                        account={membershipForPlayer(memberships, claims, p.id)}
                        onOpen={() => {
                          const parts = splitName(p);
                          setEditingPlayer({
                            pid: p.id, first: parts.first, last: parts.last,
                            // The nickname box shows a nickname only when the
                            // stored display name ISN'T what the parts would
                            // derive — otherwise it sits empty on its
                            // placeholder, which is what "no nickname" means.
                            nick: p.name === toDisplayName(parts.first, parts.last) ? "" : p.name,
                            hi: String(p.handicap_index ?? ""),
                            dir: playerIsDirector(memberships, claims, p.id),
                          });
                        }}
                      />
                    ))}
                  </Card>
                  {(() => {
                    const claimed = new Set(Object.values(claims || {}));
                    const waiting = (memberships || []).filter(m => !claimed.has(claims?.[m.id] ?? claims?.[m.uid]) || !(claims?.[m.id] ?? claims?.[m.uid]));
                    if (!waiting.length) return null;
                    return (
                      <div style={{ fontSize: FS.label, color: K.t3, marginTop: 8, lineHeight: 1.5 }}>
                        {waiting.length} signed in without claiming a name yet — they appear here once they do.
                      </div>
                    );
                  })()}
                </div>
              )}


      {/* ── Betting ── */}
      {/* Just the prices. What a seat costs is event SETUP — settled once
          before anybody tees off — so it belongs beside the roster and the
          rounds rather than on the screen the field is reading during play.
          Who is IN each game stays on the Betting tab, next to the pot the
          answer changes. */}
      {tab === "betting" && (
        <div style={{ marginTop: 4 }}>
          <SectionLabel>What a seat costs</SectionLabel>
          <Card>
            <BuyInPrices
              players={rosterPlayers}
              games={SIDE_GAME_KEYS.map(k => ({
                key: k, ...SIDE_GAME_LABELS[k],
                amount: sideGames?.[k]?.amount || 0,
                // The rebuy is incurred by placing halfway shares, not tagged,
                // so its count comes off the bets — the same list the pot is
                // counted from. Everything else is the director's own list.
                ids: k === "rebuy" ? rebuyIds : (sideGames?.[k]?.in ?? null),
                paid: sideGames?.[k]?.paid ?? [],
              }))}
              onChange={onUpdateSideGames}
            />
          </Card>
          <div style={{ fontSize: FS.label, color: K.t3, lineHeight: 1.5, marginTop: 12 }}>
            A price of zero turns that game&apos;s pot off — nothing is counted and
            nobody is billed for it.
          </div>
        </div>
      )}

      {tab === "event" && (
        <div style={{ marginTop: 16 }}>
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${K.bdr}${ALPHA.hair}`, display: "flex", flexDirection: "column", gap: 8 }}>
                <Btn onClick={async () => {
                  // MUST be awaited. This was window.confirm — a synchronous
                  // boolean — until useConfirm() was introduced in this
                  // component and shadowed the global. The hook returns a
                  // PROMISE, which is always truthy, so the un-awaited form
                  // silently wiped the tournament with no prompt at all.
                  const ok = await confirm({
                    title: "Clear all tournament data?",
                    message: "Clears all scores, course assignments, pairings, tee assignments, skins and scorecard signatures.\n\nPreserved: the player roster, handicap indexes, the event setup (name, location, rounds) and the event password.\n\nThis cannot be undone.",
                    confirmLabel: "Clear everything",
                    destructive: true,
                  });
                  if (ok) startFresh();
                }} variant="dangerOutline" block>🗑 Start Fresh — Clear All Data</Btn>
              </div>
        </div>
      )}
      {editingCourse && (() => {
        const d = editingCourse.draft;
        const saveEdit = () => { addCourse({ ...editingCourse.draft }); setEditingCourse(null); };
        const refetchTees = async () => {
          setRefetch({ busy: true, msg: "" });
          const tees = await fetchCourseTees(d.name, d.state);
          if (!tees.length) { setRefetch({ busy: false, msg: "Nothing came back for that name" }); return; }
          // Add what is missing, leave what is there. A tee already in the
          // draft may have been corrected by hand — a refetch is for filling
          // gaps, not for overwriting the director.
          const have = new Set((d.tee_boxes || []).map(t => (t.name || "").toLowerCase()));
          const added = tees.filter(t => !have.has((t.name || "").toLowerCase()));
          if (added.length) {
            setEditingCourse(prev => ({ ...prev, draft: { ...prev.draft, tee_boxes: [...(prev.draft.tee_boxes || []), ...added] } }));
          }
          setRefetch({
            busy: false,
            msg: added.length
              ? `Added ${added.length} tee${added.length === 1 ? "" : "s"} — Save to keep`
              : `All ${tees.length} tee${tees.length === 1 ? "" : "s"} already here`,
          });
        };
        const inpStyle = { background: K.inp, border: `1px solid ${ac}${ALPHA.hair}`, borderRadius: R.xs, color: K.t1, fontSize: FS.micro, textAlign: "center", width: "100%", padding: "2px 0", boxSizing: "border-box" };
        return (
          <div style={{ position: "fixed", top: 0, bottom: 0, left: 0, right: 0, background: K.bg, zIndex: 200, display: "flex", flexDirection: "column", maxWidth: 480, margin: "0 auto" }}>
            <div style={{ paddingTop: "max(14px, calc(env(safe-area-inset-top, 0px) + 14px))", paddingBottom: 10, paddingLeft: 16, paddingRight: 16, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${K.bdr}`, flexShrink: 0, background: K.bg }}>
              <Btn variant="secondary" size="sm" style={{ color: K.t2 }} onClick={() => setEditingCourse(null)}>Cancel</Btn>
              <span style={{ fontWeight: 700, fontSize: FS.body, color: K.t1 }}>Edit Course</span>
              <button onClick={saveEdit} style={{ background: ac, border: "none", borderRadius: R.sm, color: K.bg, fontSize: FS.small, fontWeight: 700, padding: "6px 18px", cursor: "pointer" }}>Save</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 48px" }}>
              {/* "Wrong course entirely" is a thing you discover while looking at
                  its scorecard, so the swap is offered here rather than as a
                  second button on the card. Only when this IS the round's
                  course — editing one from the picker is already a swap away.
                  Discards the draft: you are leaving to pick a different course,
                  and saving edits to the one you are abandoning is not the ask. */}
              {editingCourse.courseId === (tRounds.find(t => t.round_number === editRound)?.course_id) && (
                <button onClick={() => { setEditingCourse(null); setPickingCourse(true); }}
                  style={{ width: "100%", marginBottom: 16, padding: "10px 0", borderRadius: R.sm, background: "transparent", border: `1px solid ${K.bdr}`, color: K.t2, fontSize: FS.small, fontWeight: 700, cursor: "pointer" }}>
                  Change Round {editRound} to a different course
                </button>
              )}
              <div style={{ marginBottom: 16 }}><div style={{ fontSize: FS.label, color: K.t3, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Course Name</div><input value={d.name || ""} onChange={e => setEditingCourse(prev => ({ ...prev, draft: { ...prev.draft, name: e.target.value } }))} style={{ width: "100%", padding: "9px 10px", background: K.inp, border: `1px solid ${ac}${ALPHA.hair}`, borderRadius: R.sm, color: K.t1, fontSize: FS.lead, boxSizing: "border-box" }} /></div>
              {/* Pull the tees again. Sits with the tee boxes it refills, under
                  the name it searches on — edit the name first if the import
                  got it wrong, and this finds the right course. */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: FS.label, color: K.t3, fontWeight: 600, textTransform: "uppercase" }}>Tee boxes</span>
                <Btn variant="secondary" size="sm" onClick={refetchTees} disabled={refetch.busy} style={{ color: ac, borderColor: ac + ALPHA.line }}>
                  {refetch.busy ? "Fetching\u2026" : "Refetch tees"}
                </Btn>
              </div>
              {refetch.msg && (
                <div style={{ fontSize: FS.label, color: K.t3, marginBottom: 8 }}>{refetch.msg}</div>
              )}
              {[...(d.tee_boxes||[])].sort((a,b) => (parseFloat(b.slope)||0)-(parseFloat(a.slope)||0)).map((tb, tbi) => { const sortedTbs = [...(d.tee_boxes||[])].sort((a,b) => (parseFloat(b.slope)||0)-(parseFloat(a.slope)||0)); const origIdx = d.tee_boxes.indexOf(sortedTbs[tbi]); return (<div key={tbi} style={{ background: K.card, border: `1px solid ${K.bdr}`, borderRadius: R.md, padding: "10px 12px", marginBottom: 8 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><TeeColorSwatch color={tb.color} name={tb.name} size={12} /><span style={{ fontWeight: 700, fontSize: FS.body, color: K.t1 }}>{tb.name}</span></div><button onClick={() => setEditingCourse(prev => ({ ...prev, draft: { ...prev.draft, tee_boxes: prev.draft.tee_boxes.filter((_,i) => i !== origIdx) } }))} style={{ background: "transparent", border: "none", color: K.t3, cursor: "pointer", fontSize: FS.lead, lineHeight: 1, padding: "0 4px" }}>✕</button></div><div style={{ display: "flex", gap: 8 }}>{["rating","slope","par"].map(f => (<div key={f} style={{ flex: 1 }}><div style={{ fontSize: FS.micro, color: K.t3, textTransform: "uppercase", marginBottom: 3 }}>{f}</div><input inputMode="decimal" value={tb[f]||""} onChange={e => setEditingCourse(prev => { const tbs = [...prev.draft.tee_boxes]; tbs[origIdx] = {...tbs[origIdx],[f]:e.target.value}; return {...prev,draft:{...prev.draft,tee_boxes:tbs}}; })} style={{ width: "100%", padding: "7px 6px", background: K.inp, border: `1px solid ${ac}${ALPHA.hair}`, borderRadius: R.sm, color: K.t1, fontSize: FS.small, textAlign: "center", boxSizing: "border-box" }} /></div>))}</div></div>); })}
              {[["Front", 0, 9], ["Back", 9, 9]].map(([label, start, count]) => { const pars = (d.hole_pars||[]).slice(start, start+count); const hcps = (d.hole_handicaps||[]).slice(start, start+count); return (<div key={label} style={{ marginBottom: 8 }}><div style={{ fontSize: FS.label, color: K.t3, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>{label} 9</div><div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 32px`, gap: 2, fontSize: FS.micro }}><div style={{ color: K.t3, fontWeight: 600, padding: "2px 0" }}>Hole</div>{Array.from({length:count},(_,i)=><div key={i} style={{ textAlign:"center", color:K.t2, fontWeight:700, padding:"2px 0" }}>{start+i+1}</div>)}<div /></div><div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 32px`, gap: 2, background: K.inp, borderRadius: R.sm, padding: "2px 0", marginBottom: 2 }}><div style={{ color: K.t3, fontWeight: 600, padding: "3px 2px", fontSize: FS.micro }}>Par</div>{Array.from({length:count},(_,i) => (<input key={i} inputMode="numeric" value={pars[i]??""} onChange={e => setEditingCourse(prev => { const hp=[...(prev.draft.hole_pars||[])]; hp[start+i]=parseInt(e.target.value)||0; return {...prev,draft:{...prev.draft,hole_pars:hp}}; })} style={inpStyle} />))}<div style={{ textAlign:"center", color:ac, fontWeight:800, padding:"3px 0", fontSize: FS.label }}>{pars.reduce((a,b)=>a+(+b||0),0)}</div></div><div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 32px`, gap: 2 }}><div style={{ color: K.t3, fontWeight: 600, padding: "2px 2px", fontSize: FS.micro }}>HCP</div>{Array.from({length:count},(_,i) => (<input key={i} inputMode="numeric" value={hcps[i]??""} onChange={e => setEditingCourse(prev => { const hh=[...(prev.draft.hole_handicaps||[])]; hh[start+i]=parseInt(e.target.value)||0; return {...prev,draft:{...prev.draft,hole_handicaps:hh}}; })} style={{...inpStyle, color:K.t3}} />))}<div /></div></div>); })}
            </div>
          </div>
        );
      })()}
      {confirmCourse && (confirmCourse.round || confirmCourse.delete) && (
        <div style={{ position: "fixed", top: 0, bottom: 0, left: 0, right: 0, background: SCRIM, zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setConfirmCourse(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: K.card, borderRadius: R.xl, padding: "20px 20px 16px", width: "100%", maxWidth: 360, boxShadow: "0 16px 48px rgba(0,0,0,0.6)" }}>
            {confirmCourse.round ? (<><div style={{ fontSize: FS.body, fontWeight: 700, color: K.warn, marginBottom: 8 }}>Reassign Round {confirmCourse.round}?</div><div style={{ fontSize: FS.small, color: K.t2, marginBottom: 20, lineHeight: 1.4 }}>Move R{confirmCourse.round} to <strong style={{ color: K.t1 }}>{confirmCourse.course.name}</strong>?</div><div style={{ display: "flex", gap: 10 }}><Btn variant="secondary" style={{ flex: 1, color: K.t2 }} onClick={() => setConfirmCourse(null)}>Cancel</Btn><Btn style={{ flex: 1 }} onClick={() => { setCourseForRound(confirmCourse.round, confirmCourse.course); setConfirmCourse(null); setPickingCourse(false); doCourseSearch(""); }}>Move</Btn></div></>) : (<><div style={{ fontSize: FS.body, fontWeight: 700, color: K.danger, marginBottom: 8 }}>Remove Course?</div><div style={{ fontSize: FS.small, color: K.t2, marginBottom: 20, lineHeight: 1.4 }}>Remove <strong style={{ color: K.t1 }}>{confirmCourse.course.name}</strong>?{confirmCourse.assignedRounds.length > 0 && <span style={{ color: K.warn }}> (unassigns R{confirmCourse.assignedRounds.join(", R")})</span>}</div><div style={{ display: "flex", gap: 10 }}><Btn variant="secondary" style={{ flex: 1, color: K.t2 }} onClick={() => setConfirmCourse(null)}>Cancel</Btn><Btn variant="danger" style={{ flex: 1 }} onClick={() => { confirmCourse.assignedRounds.forEach(r => setCourseForRound(r, { id: null, name: "" })); addCourse({ _delete: true, id: confirmCourse.course.id }); setConfirmCourse(null); }}>Remove</Btn></div></>)}
          </div>
        </div>
      )}
      {/* ── Round N: ONE card for the course and its tees ────────────────
          There used to be three stacked boxes here — an assigned-course
          summary, a course library/search box, and a tee card — each with its
          own header and padding, which is most of a phone screen before you
          reach a single player. They are one card now, because they are one
          decision: the round plays one course, off one set of tees.

          The card has two states. With a course assigned it shows that course
          and goes straight into tee assignment; the search is folded away
          behind "Change", since a round that already has a course does not
          need a search box parked under it. With no course (or after tapping
          Change) the same card IS the search.

          Cross-round assignment chips are gone with the old library grid: one
          course per round, picked in the round it belongs to. Using the same
          course twice is switching the round selector above and picking it
          again. */}
      {tab === "rounds" && (() => {
        const st = getRoundStatus(editRound);
        const assigned = st.course;
        const locked = st.finalized;
        const picking = !locked && (!assigned || pickingCourse);
        const closePicker = () => { setPickingCourse(false); doCourseSearch(""); setManualCourse(null); };
        const unassignedRounds = Array.from({ length: numRounds }, (_, ri) => ri + 1).filter(r => !tRounds.find(t => t.round_number === r && t.course_id));
        return (
          <div style={{ background: K.card, borderRadius: R.lg, border: `1px solid ${assigned ? ac  + ALPHA.hair : K.bdr}`, overflow: "hidden", marginBottom: 12 }}>

            {/* Header: what round, what course, and the way out of both states */}
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${K.bdr}` }}>
              {assigned && !picking && (
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: FS.body, fontWeight: 700, color: K.t1 }}>{assigned.name}</div>
                    {/* Which rounds still have no course is the one thing the
                        round pills above do NOT show (their dots are tees and
                        pairings). The course's city and par used to lead this
                        line; they are on the scorecard behind Edit, and this
                        space is better spent on what the event still needs. */}
                    {(locked || unassignedRounds.length > 0) && (
                      <div style={{ fontSize: FS.label, color: K.t3 }}>
                        {locked && <span style={{ fontWeight: 700 }}>Finalized</span>}
                        {!locked && unassignedRounds.length > 0 && <span style={{ color: K.warn, fontWeight: 700 }}>R{unassignedRounds.join(", R")} unset</span>}
                      </div>
                    )}
                  </div>
                  {!locked && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      {/* Tee sign-off. Lit while there is something to sign off —
                          never saved, or saved and then changed — and spent once
                          the round's tees are settled. A tick that is also a
                          button is a status light you have to discover you can
                          press; this says the word. */}
                      {(() => {
                        const saved = !!(teesSaved || {})[editRound];
                        const modified = !!(teesModified || {})[editRound];
                        const pending = !saved || modified;
                        return (
                          <button onClick={() => pending && onTeesSave && onTeesSave(editRound)}
                            title={pending ? "Save tee selections for this round" : "Tees saved"}
                            style={{
                              flexShrink: 0, padding: "5px 12px", borderRadius: R.sm, cursor: pending ? "pointer" : "default",
                              background: pending ? ac : "transparent",
                              border: `1px solid ${pending ? "transparent" : K.bdr}`,
                              color: pending ? ON_ACC : K.t3, fontSize: FS.label, fontWeight: 700,
                              transition: `background ${MOTION} ease, border-color ${MOTION} ease, color ${MOTION} ease`,
                            }}>{pending ? "Save" : "Saved"}</button>
                        );
                      })()}
                      {/* Pars, handicaps and tee boxes for the course this round is
                          playing — and, from inside the editor, swapping the course
                          for a different one. */}
                      <button onClick={() => { setRefetch({ busy: false, msg: "" }); setEditingCourse({ courseId: assigned.id, draft: { ...assigned, hole_pars: [...(assigned.hole_pars || Array(18).fill(4))], hole_handicaps: [...(assigned.hole_handicaps || Array(18).fill(0))], tee_boxes: (assigned.tee_boxes || []).map(t => ({ ...t })) } }); }}
                        style={{ flexShrink: 0, padding: "5px 12px", borderRadius: R.sm, background: "transparent", border: `1px solid ${ac}${ALPHA.line}`, color: ac, fontSize: FS.label, fontWeight: 700, cursor: "pointer" }}>Edit</button>
                    </div>
                  )}
                </div>
              )}

              {/* A finalized round with no course is a dead end by design — there
                  is nothing to set and nothing to play. Say that rather than
                  leaving an empty card. */}
              {locked && !assigned && (
                <div style={{ fontSize: FS.label, color: K.t3 }}>Round {editRound} is finalized, and no course was ever set for it.</div>
              )}

              {picking && (
                <div style={{ display: "flex", gap: 6 }}>
                  <select value={courseStateFilter} onChange={e => { setCourseStateFilter(e.target.value); if (courseSearch.trim().length >= 2) doCourseSearch(courseSearch, e.target.value); }}
                    style={{ width: 62, padding: "8px 5px", background: K.inp, border: `1px solid ${ac}${ALPHA.hair}`, borderRadius: R.sm, color: K.t1, fontSize: FS.small, flexShrink: 0 }}>
                    <option value="">All</option>
                    {["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input value={courseSearch} onChange={e => doCourseSearch(e.target.value)} placeholder={`Search courses for Round ${editRound}…`}
                    style={{ flex: 1, minWidth: 0, padding: "8px 11px", background: K.inp, border: `1px solid ${ac}${ALPHA.hair}`, borderRadius: R.sm, color: K.t1, fontSize: FS.lead, boxSizing: "border-box" }} />
                  {/* Cancel only exists when there is something to go back to. */}
                  {assigned
                    ? <button onClick={closePicker} style={{ flexShrink: 0, padding: "0 10px", borderRadius: R.sm, background: "transparent", border: `1px solid ${K.bdr}`, color: K.t3, fontSize: FS.label, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
                    : courseSearch !== "" && <button onClick={() => { doCourseSearch(""); setManualCourse(null); }} style={{ flexShrink: 0, padding: "0 10px", borderRadius: R.sm, background: "transparent", border: `1px solid ${K.bdr}`, color: K.t3, fontSize: FS.small, cursor: "pointer" }}>✕</button>}
                </div>
              )}

            </div>

            {/* ── PICKING: your courses, then the API ── */}
            {picking && (() => {
              const q = courseSearch.trim().toLowerCase();
              const searching = q.length >= 2;
              // The imported years brought ~50 courses in with them, each frozen
              // at the rating it was played off a decade ago. They belong to
              // their edition, not to a director setting up next Saturday, and
              // unfiltered they bury the handful actually in rotation.
              const pickable = courses.filter(c => !isHistoryCourseId(c.id));
              const lib = searching
                ? pickable.filter(c => (c.name || "").toLowerCase().includes(q) || (c.city || "").toLowerCase().includes(q))
                : pickable;
              const use = (c) => { setCourseForRound(editRound, c); closePicker(); };
              return (
                <>
                  {pickable.length === 0 && (
                    <div style={{ padding: 14, textAlign: "center", color: K.t3, fontSize: FS.label, lineHeight: 1.5 }}>No courses yet — search above to pull one from GolfCourseAPI, or add it by hand.</div>
                  )}
                  {courses.length > 0 && lib.length === 0 && (
                    <div style={{ padding: "9px 14px", color: K.t3, fontSize: FS.label }}>Nothing you have saved matches “{courseSearch.trim()}”.</div>
                  )}
                  {lib.length > 0 && (
                    <>
                      <div style={{ padding: "7px 14px 3px", fontSize: FS.micro, fontWeight: 700, color: K.t3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Your courses</div>
                      {lib.map((c, i) => {
                        const isAssigned = assigned && assigned.id === c.id;
                        const otherRounds = Array.from({ length: numRounds }, (_, ri) => ri + 1).filter(r => r !== editRound && tRounds.find(t => t.round_number === r && t.course_id === c.id));
                        return (
                          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderBottom: i < lib.length - 1 ? `1px solid ${K.bdr}${ALPHA.wash}` : "none", background: isAssigned ? ac  + ALPHA.wash : "transparent" }}>
                            {/* The whole row picks the course — the button beside
                                it is a label for what tapping does, not the only
                                place you may tap. */}
                            <button onClick={() => { if (!isAssigned) use(c); }} style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", padding: 0, textAlign: "left", cursor: isAssigned ? "default" : "pointer" }}>
                              <div style={{ fontSize: FS.small, fontWeight: 600, color: K.t1 }}>{c.name}</div>
                              <div style={{ fontSize: FS.micro, color: K.t3 }}>
                                {c.city}{c.city && c.state ? ", " : ""}{c.state}
                                {(c.tee_boxes || []).length ? ` · ${c.tee_boxes.length} tee${c.tee_boxes.length === 1 ? "" : "s"}` : ""}
                                {otherRounds.length > 0 ? ` · R${otherRounds.join(", R")}` : ""}
                              </div>
                            </button>
                            {isAssigned
                              ? <span style={{ fontSize: FS.micro, fontWeight: 700, color: ac, flexShrink: 0 }}>✓ this round</span>
                              : <button onClick={() => use(c)} style={{ flexShrink: 0, fontSize: FS.label, fontWeight: 700, color: K.t2, background: "transparent", border: `1px solid ${K.bdr}`, borderRadius: R.sm, padding: "3px 9px", cursor: "pointer" }}>Use</button>}
                            <button title="Edit course" onClick={() => setEditingCourse({ courseId: c.id, draft: { ...c, hole_pars: [...(c.hole_pars || Array(18).fill(4))], hole_handicaps: [...(c.hole_handicaps || Array(18).fill(0))], tee_boxes: (c.tee_boxes || []).map(t => ({ ...t })) } })}
                              style={{ flexShrink: 0, background: "transparent", border: "none", color: ac, fontSize: FS.label, fontWeight: 700, cursor: "pointer", padding: "2px 2px" }}>Edit</button>
                            <button title="Remove from your courses" onClick={() => setConfirmCourse({ course: c, delete: true, assignedRounds: Array.from({ length: numRounds }, (_, ri) => ri + 1).filter(r => tRounds.find(t => t.round_number === r && t.course_id === c.id)) })}
                              style={{ flexShrink: 0, background: "transparent", border: "none", color: K.t3, fontSize: FS.small, cursor: "pointer", padding: "2px 2px", lineHeight: 1 }}>✕</button>
                          </div>
                        );
                      })}
                    </>
                  )}

                  {/* API results — only once the query is worth sending. */}
                  {searching && (
                    <div style={{ padding: 14, borderTop: `1px solid ${K.bdr}` }}>
                      <div style={{ fontSize: FS.micro, fontWeight: 700, color: K.t3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Search results</div>
                  {searchLoading && <div style={{ textAlign: "center", padding: 12, color: K.t3, fontSize: FS.label }}>Searching GolfCourseAPI...</div>}
                  {!searchLoading && courseSearch.trim().length >= 2 && searchResults.length === 0 && !manualCourse && (
                    <div style={{ textAlign: "center", padding: "10px 0", color: K.t3, fontSize: FS.label }}>No courses found</div>
                  )}
                  {!searchLoading && manualCourse && (() => {
                    const mc = manualCourse;
                    const setMc = fn => setManualCourse(prev => fn(prev));
                    const inpBase = { background: K.inp, border: `1px solid ${ac}${ALPHA.hair}`, borderRadius: R.sm, color: K.t1, padding: "6px 8px", fontSize: FS.small, boxSizing: "border-box" };
                    const tinyInp = { background: K.inp, border: `1px solid ${ac}${ALPHA.hair}`, borderRadius: R.xs, color: K.t1, fontSize: FS.micro, textAlign: "center", width: "100%", padding: "2px 1px", boxSizing: "border-box" };
                    const label = (txt) => <div style={{ fontSize: FS.micro, color: K.t3, fontWeight: 600, marginBottom: 2, textTransform: "uppercase" }}>{txt}</div>;
                    const canSave = mc.name.trim().length > 1;
                    return (
                      <div style={{ background: K.card, border: `1px solid ${ac}${ALPHA.hair}`, borderRadius: R.md, padding: 14, marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <span style={{ fontSize: FS.small, fontWeight: 800, color: K.t1 }}>Manual Course Entry</span>
                          <button onClick={() => setManualCourse(null)} style={{ background: "transparent", border: "none", color: K.t3, fontSize: FS.lead, cursor: "pointer", lineHeight: 1 }}>✕</button>
                        </div>

                        {/* Name / City / State */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 60px", gap: 6, marginBottom: 8 }}>
                          <div>
                            {label("Course Name")}
                            <input value={mc.name} onChange={e => setMc(p=>({...p,name:e.target.value}))} style={{...inpBase, width:"100%"}} placeholder="e.g. Treetops Resort" />
                          </div>
                          <div>
                            {label("City")}
                            <input value={mc.city} onChange={e => setMc(p=>({...p,city:e.target.value}))} style={{...inpBase, width:"100%"}} placeholder="e.g. Gaylord" />
                          </div>
                          <div>
                            {label("State")}
                            <select value={mc.state} onChange={e => setMc(p=>({...p,state:e.target.value}))} style={{...inpBase, width:"100%"}}>
                              <option value="">—</option>
                              {["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"].map(s=><option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                        </div>

                        {/* Tee Boxes */}
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                            {label("Tee Boxes")}
                            <button onClick={() => setMc(p=>({...p, tee_boxes:[...p.tee_boxes, {name:"", color:"#888888", rating:72.0, slope:113, par:72, yardage:0}]}))}
                              style={{ fontSize: FS.micro, padding: "1px 6px", borderRadius: R.xs, background: "transparent", border: `1px solid ${ac}${ALPHA.line}`, color: ac, cursor: "pointer", fontWeight: 700 }}>+ Tee</button>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "12px 70px 50px 44px 32px 32px 40px 20px", gap: 3, fontSize: FS.micro, color: K.t3, fontWeight: 600, marginBottom: 2, paddingLeft: 2 }}>
                            <div/>
                            <div>Name</div><div>Color</div><div>Rating</div><div>Slope</div><div>Par</div><div>Yards</div><div/>
                          </div>
                          {mc.tee_boxes.map((tb, tbi) => (
                            <div key={tbi} style={{ display: "grid", gridTemplateColumns: "12px 70px 50px 44px 32px 32px 40px 20px", gap: 3, marginBottom: 3, alignItems: "center" }}>
                              <TeeColorSwatch color={tb.color} name={tb.name} size={10} />
                              <input value={tb.name} onChange={e => setMc(p=>{const t=[...p.tee_boxes]; t[tbi]={...t[tbi],name:e.target.value}; return {...p,tee_boxes:t};})} style={{...tinyInp, textAlign:"left", padding:"2px 4px"}} placeholder="Name" />
                              <div style={{ position:"relative", width:"100%", height:22, flexShrink:0 }}>
                                <div style={{ position:"absolute", inset:0, borderRadius: R.xs, background:tb.color||"#888", border:"1px solid #ffffff25", pointerEvents:"none" }} />
                                <select value={Object.entries(TEE_COLOR_MAP).find(([,v])=>v===(tb.color||""))?.[0] || "black"}
                                  onChange={e => { const clr = TEE_COLOR_MAP[e.target.value] || tb.color || "#888888"; setMc(p=>{const t=[...p.tee_boxes]; t[tbi]={...t[tbi],color:clr}; return {...p,tee_boxes:t};}); }}
                                  style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0, cursor:"pointer", fontSize: FS.small }}>
                                  {[["Black","#2c2c2c"],["Blue","#2d8fd4"],["White","#e8e8e8"],["Gold","#d4a843"],["Red","#9b2335"],["Green","#2d8a4e"],["Silver","#a8b2bd"],["Yellow","#e6c619"],["Orange","#e67e22"],["Purple","#7b2d8b"],["Maroon","#6b1c2a"],["Teal","#1a8a7a"],["Platinum","#c0c0c0"]].map(([n])=><option key={n} value={n.toLowerCase()}>{n}</option>)}
                                </select>
                              </div>
                              <input value={tb.rating} onChange={e => setMc(p=>{const t=[...p.tee_boxes]; t[tbi]={...t[tbi],rating:e.target.value}; return {...p,tee_boxes:t};})} style={tinyInp} />
                              <input value={tb.slope} onChange={e => setMc(p=>{const t=[...p.tee_boxes]; t[tbi]={...t[tbi],slope:e.target.value}; return {...p,tee_boxes:t};})} style={tinyInp} />
                              <input value={tb.par} onChange={e => setMc(p=>{const t=[...p.tee_boxes]; t[tbi]={...t[tbi],par:e.target.value}; return {...p,tee_boxes:t};})} style={tinyInp} />
                              <input value={tb.yardage} onChange={e => setMc(p=>{const t=[...p.tee_boxes]; t[tbi]={...t[tbi],yardage:e.target.value}; return {...p,tee_boxes:t};})} style={tinyInp} />
                              <button onClick={() => setMc(p=>({...p,tee_boxes:p.tee_boxes.filter((_,i)=>i!==tbi)}))} style={{ background:"transparent", border:"none", color:K.t3, fontSize: FS.label, cursor:"pointer", padding:0, lineHeight:1 }}>✕</button>
                            </div>
                          ))}
                        </div>

                        {/* Hole Pars & Handicaps */}
                        {[["Front 9", 0, 9], ["Back 9", 9, 9]].map(([label9, start, count]) => (
                          <div key={label9} style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: FS.micro, color: K.t3, fontWeight: 600, marginBottom: 3, textTransform: "uppercase" }}>{label9}</div>
                            <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: FS.micro }}>
                              <div style={{ color: K.t3, fontWeight: 600, padding: "2px 0" }}>Hole</div>
                              {Array.from({length:count},(_,i) => <div key={i} style={{ textAlign:"center", color:K.t2, fontWeight:700, padding:"2px 0" }}>{start+i+1}</div>)}
                              <div />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: FS.micro, background: K.inp, borderRadius: R.xs, marginBottom: 2 }}>
                              <div style={{ color: K.t3, fontWeight: 600, padding: "3px 2px" }}>Par</div>
                              {Array.from({length:count},(_,i) => (
                                <input key={i} value={mc.hole_pars[start+i]??""} onChange={e => setMc(p=>{const hp=[...p.hole_pars]; hp[start+i]=e.target.value; return {...p,hole_pars:hp};})}
                                  style={{ background:"transparent", border:"none", color:K.t1, fontSize: FS.micro, fontWeight:700, textAlign:"center", width:"100%", padding:"3px 0" }} />
                              ))}
                              <div style={{ textAlign:"center", color:ac, fontWeight:800, padding:"3px 0", fontSize: FS.micro }}>
                                {mc.hole_pars.slice(start,start+count).reduce((a,b)=>a+(parseInt(b)||0),0)}
                              </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: FS.micro }}>
                              <div style={{ color: K.t3, fontWeight: 600, padding: "2px 2px" }}>HCP</div>
                              {Array.from({length:count},(_,i) => (
                                <input key={i} value={mc.hole_handicaps[start+i]??""} onChange={e => setMc(p=>{const hh=[...p.hole_handicaps]; hh[start+i]=e.target.value; return {...p,hole_handicaps:hh};})}
                                  style={{ background:"transparent", border:"none", color:K.t3, fontSize: FS.micro, textAlign:"center", width:"100%", padding:"2px 0" }} />
                              ))}
                              <div />
                            </div>
                          </div>
                        ))}

                        {/* Save button */}
                        <button onClick={() => {
                          const firstTee = mc.tee_boxes[0];
                          const course = {
                            ...mc,
                            par: parseInt(firstTee?.par) || 72,
                            slope: parseInt(firstTee?.slope) || 113,
                            rating: parseFloat(firstTee?.rating) || 72.0,
                            hole_pars: mc.hole_pars.map(v=>parseInt(v)||4),
                            hole_handicaps: mc.hole_handicaps.map(v=>parseInt(v)||0),
                            tee_boxes: mc.tee_boxes.map(tb=>({...tb, rating:parseFloat(tb.rating)||72.0, slope:parseInt(tb.slope)||113, par:parseInt(tb.par)||72, yardage:parseInt(tb.yardage)||0})),
                          };
                          addCourseToLibrary(course);
                          setManualCourse(null);
                        }} disabled={!canSave} style={{ width:"100%", padding:"10px 0", borderRadius: R.sm, background: canSave ? ac : K.bdr, border:"none", color: canSave ? K.bg : K.t3, fontSize: FS.small, fontWeight:700, cursor: canSave ? "pointer" : "default", marginTop:4 }}>
                          ✓ Add Course
                        </button>
                      </div>
                    );
                  })()}
                  {!searchLoading && searchResults.filter(c => !courses.find(ex => ex.id === c.id)).map(c => (
                    <button key={c.id} onClick={() => {
                      const sbVer = c._sbVersion || (c.updated_at ? c : null);
                      const hasLocalData = !!(sbVer && (sbVer.updated_at || c.updated_at));
                      if (hasLocalData) {
                        // Course exists in local DB — prompt user to use local or fetch fresh
                        const localCourse = sbVer || c;
                        setLocalDbPrompt({ sbCourse: localCourse, apiCourse: c._apiVersion || null, fullCourse: c });
                      } else if (c._apiVersion) {
                        if (c._apiHasReal && !c._sbHasReal) {
                          const { _apiVersion, _sbHasReal, _apiHasReal, ...sbBase } = c;
                          setCoursePreview({ ...sbBase, ...c._apiVersion, _apiVersion: c._apiVersion, _apiHasReal: true, _sbHasReal: false });
                        } else {
                          setCoursePreview(c);
                        }
                      } else {
                        setCoursePreview(c);
                      }
                    }} style={{ display: "block", width: "100%", background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: R.md, padding: "10px 14px", cursor: "pointer", textAlign: "left", color: K.t1, marginBottom: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ fontWeight: 600, fontSize: FS.small }}>{c.name}</div>
                            {c._incompleteData && <span style={{ fontSize: FS.micro, background: "#d4584520", border: "1px solid #d4584540", color: "#d45845", borderRadius: R.xs, padding: "1px 5px", fontWeight: 700 }}>⚠ incomplete data</span>}
                            {!c._incompleteData && (c.tee_boxes?.length || 0) < 2 && <span style={{ fontSize: FS.micro, background: K.gold + ALPHA.tint, border: `1px solid ${K.gold}${ALPHA.hair}`, color: K.gold, borderRadius: R.xs, padding: "1px 5px", fontWeight: 700 }}>⚠ 1 tee</span>}
                            {c._source && c._source !== "WBC History" && <span style={{ fontSize: FS.micro, background: `${ac}${ALPHA.wash}`, border: `1px solid ${ac}${ALPHA.hair}`, color: ac, borderRadius: R.xs, padding: "1px 5px", fontWeight: 600 }}>{c._source}</span>}
                            {c.updated_at && (() => {
                              const d = new Date(c.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                              return (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: FS.micro, background: "#2d8a4e20", border: "1px solid #2d8a4e40", color: "#2d8a4e", borderRadius: R.xs, padding: "1px 5px", fontWeight: 600 }}>
                                  <img src={TROPHY_SVG_URL} alt="" style={{ width: 9, height: 9, filter: "brightness(0) saturate(100%) invert(42%) sepia(73%) saturate(400%) hue-rotate(100deg) brightness(95%)" }} />
                                  {d}{c.updated_by && c.updated_by !== "Unknown" ? ` · ${c.updated_by}` : ""}
                                </span>
                              );
                            })()}
                          </div>
                          <div style={{ fontSize: FS.label, color: K.t3 }}>{c.city}{c.state ? `, ${c.state}` : ""}{c.par ? ` · Par ${c.par}` : ""}{(() => { const realTbSlope = (c.tee_boxes || []).find(t => parseInt(t.slope) !== 113)?.slope; const displaySlope = realTbSlope || (c.slope && parseInt(c.slope) !== 113 ? c.slope : null); return displaySlope ? ` · Slope ${displaySlope}` : ""; })()}</div>
                        </div>
                        <span style={{ color: ac, fontSize: FS.label, fontWeight: 700 }}>Preview →</span>
                      </div>
                    </button>
                  ))}
                  {/* Adding by hand is offered whenever a search is on, not only
                      when it came back empty. The API returning SOMETHING is not
                      the same as it returning the course you are playing, and the
                      old shape — button only when there were no results at all —
                      left a director who could see three wrong courses with no
                      way through except typing a nonsense query to clear them. */}
                  {!searchLoading && courseSearch.trim().length >= 2 && !manualCourse && (
                    <div style={{ textAlign: "center", padding: "4px 0 2px" }}>
                      <button onClick={() => setManualCourse({
                        id: `manual_${Date.now()}`,
                        name: courseSearch.trim(),
                        city: "", state: courseStateFilter || "",
                        par: 72, slope: 113, rating: 72.0,
                        hole_pars: Array(18).fill(4),
                        hole_handicaps: Array(18).fill(0).map((_,i)=>i+1),
                        tee_boxes: [
                          { name: "Black", color: "#222222", rating: 74.0, slope: 130, par: 72, yardage: 6800 },
                          { name: "Blue",  color: "#1a56db", rating: 72.0, slope: 120, par: 72, yardage: 6400 },
                          { name: "White", color: "#e5e7eb", rating: 70.0, slope: 113, par: 72, yardage: 6000 },
                          { name: "Red",   color: "#e02424", rating: 68.0, slope: 108, par: 72, yardage: 5400 },
                        ],
                      })} style={{ padding: "7px 16px", borderRadius: R.sm, background: "transparent", border: `1px solid ${ac}`, color: ac, fontSize: FS.label, fontWeight: 700, cursor: "pointer" }}>
                        + Add “{courseSearch.trim()}” by hand
                      </button>
                    </div>
                  )}
                  {/* Local DB prompt modal */}
                  {localDbPrompt && (() => {
                    const { sbCourse } = localDbPrompt;
                    const tbs = sbCourse.tee_boxes || [];
                    const updatedAt = sbCourse.updated_at;
                    const updatedBy = sbCourse.updated_by || "Unknown";
                    const formattedDate = updatedAt ? new Date(updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
                    const ScorecardPreview = ({ course }) => {
                      const hp = course.hole_pars || [];
                      const hh = course.hole_handicaps || [];
                      if (!hp.length) return <div style={{ fontSize: FS.label, color: K.t3, fontStyle: "italic", marginBottom: 8 }}>No hole data available</div>;
                      return (
                        <div style={{ marginBottom: 10 }}>
                          {[["Front", 0, 9], ["Back", 9, 9]].map(([lbl, start, count]) => {
                            const pars = hp.slice(start, start + count);
                            const hcps = hh.slice(start, start + count);
                            const firstTee = (course.tee_boxes || [])[0];
                            const yds = (firstTee?.hole_yards || []).slice(start, start + count);
                            const hasYds = yds.some(y => y > 0);
                            return (
                              <div key={lbl} style={{ marginBottom: 4 }}>
                                <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: FS.micro }}>
                                  <div style={{ color: K.t3, fontWeight: 600, padding: "2px 0" }}>Hole</div>
                                  {Array.from({length: count}, (_, i) => <div key={i} style={{ textAlign: "center", color: K.t2, fontWeight: 700, padding: "2px 0" }}>{start + i + 1}</div>)}
                                  <div style={{ textAlign: "center", color: K.t3, fontSize: FS.micro, padding: "2px 0" }}>Tot</div>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: FS.micro, background: K.inp, borderRadius: R.xs, marginBottom: 1 }}>
                                  <div style={{ color: K.t3, fontWeight: 600, padding: "3px 2px" }}>Par</div>
                                  {pars.map((p, i) => <div key={i} style={{ textAlign: "center", color: K.t1, fontWeight: 700, padding: "3px 0" }}>{p || "–"}</div>)}
                                  <div style={{ textAlign: "center", color: ac, fontWeight: 800, padding: "3px 0", fontSize: FS.micro }}>{pars.reduce((a, b) => a + (parseInt(b) || 0), 0)}</div>
                                </div>
                                {hcps.some(h => h > 0) && (
                                  <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: FS.micro, marginBottom: 1 }}>
                                    <div style={{ color: K.t3, fontWeight: 600, padding: "2px 2px" }}>HCP</div>
                                    {hcps.map((h, i) => <div key={i} style={{ textAlign: "center", color: K.t3, padding: "2px 0" }}>{h || "–"}</div>)}
                                    <div />
                                  </div>
                                )}
                                {hasYds && (
                                  <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: FS.micro }}>
                                    <div style={{ color: K.t3, fontWeight: 600, padding: "2px 2px" }}>Yds</div>
                                    {yds.map((y, i) => <div key={i} style={{ textAlign: "center", color: K.t3, padding: "2px 0" }}>{y || "–"}</div>)}
                                    <div style={{ textAlign: "center", color: K.t3, padding: "2px 0" }}>{yds.reduce((a, b) => a + (parseInt(b) || 0), 0) || ""}</div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    };
                    return (
                      <CoursePreviewPortal>
                      <div style={{ position: "fixed", inset: 0, background: SCRIM, zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                        <div style={{ background: K.card, borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto", padding: "20px 18px 28px" }}>
                          {/* Header */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: FS.lead, color: K.t1, marginBottom: 2 }}>{sbCourse.name}</div>
                              <div style={{ fontSize: FS.label, color: K.t3 }}>{[sbCourse.city, sbCourse.state].filter(Boolean).join(", ")} · Par {sbCourse.par} · Slope {sbCourse.slope}</div>
                            </div>
                            <span onClick={() => setLocalDbPrompt(null)} style={{ fontSize: FS.title, color: K.t3, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>✕</span>
                          </div>

                          {/* Local DB notice */}
                          <div style={{ background: `${ac}${ALPHA.wash}`, border: `1px solid ${ac}${ALPHA.hair}`, borderRadius: R.md, padding: "10px 14px", marginBottom: 16 }}>
                            <div style={{ fontWeight: 700, fontSize: FS.small, color: ac, marginBottom: 4 }}>📁 Course exists in local database</div>
                            <div style={{ fontSize: FS.label, color: K.t2 }}>
                              Last saved {formattedDate ? `on ${formattedDate}` : ""} by <strong>{updatedBy}</strong>
                            </div>
                            <div style={{ fontSize: FS.label, color: K.t3, marginTop: 2 }}>
                              {tbs.length} tee {tbs.length === 1 ? "box" : "boxes"}{tbs.length > 0 ? ` — ${tbs.map(t => t.name).join(", ")}` : ""}
                            </div>
                          </div>

                          {/* Tee boxes preview */}
                          {tbs.length > 0 && (
                            <div style={{ marginBottom: 14 }}>
                              <div style={{ fontSize: FS.micro, color: K.t3, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Tee Boxes</div>
                              <div style={{ display: "grid", gridTemplateColumns: "14px 1fr 44px 38px 30px 46px", gap: "3px 4px", fontSize: FS.micro, color: K.t3, fontWeight: 600, marginBottom: 3, paddingLeft: 2 }}>
                                <div/><div>Name</div><div style={{textAlign:"center"}}>Rating</div><div style={{textAlign:"center"}}>Slope</div><div style={{textAlign:"center"}}>Par</div><div style={{textAlign:"center"}}>Yards</div>
                              </div>
                              {tbs.map((tb, i) => (
                                <div key={i} style={{ display: "grid", gridTemplateColumns: "14px 1fr 44px 38px 30px 46px", gap: "3px 4px", marginBottom: 3, alignItems: "center", fontSize: FS.label }}>
                                  <TeeColorSwatch color={tb.color} name={tb.name} size={12} />
                                  <div style={{ color: K.t1, fontWeight: 600 }}>{tb.name}</div>
                                  <div style={{ textAlign: "center", color: K.t2 }}>{tb.rating}</div>
                                  <div style={{ textAlign: "center", color: K.t2 }}>{tb.slope}</div>
                                  <div style={{ textAlign: "center", color: K.t2 }}>{tb.par}</div>
                                  <div style={{ textAlign: "center", color: K.t2 }}>{tb.yardage ? tb.yardage.toLocaleString() : "–"}</div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Scorecard preview */}
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: FS.micro, color: K.t3, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Scorecard</div>
                            <ScorecardPreview course={sbCourse} />
                          </div>

                          {/* Action buttons */}
                          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                            <button onClick={() => {
                              // Use local data — open preview with Firestore course
                              setLocalDbPrompt(null);
                              setCoursePreview({ ...sbCourse, _source: "WBC History" });
                            }} style={{ flex: 1, padding: "12px 0", borderRadius: R.md, background: ac, border: "none", color: "#0a1628", fontSize: FS.small, fontWeight: 700, cursor: "pointer" }}>
                              ✓ Use Local Data
                            </button>
                            <button onClick={async () => {
                              // Fetch fresh from API — run search and open preview with API data
                              setLocalDbPrompt(null);
                              setSearchLoading(true);
                              try {
                                const q = sbCourse.name;
                                const stateParam = sbCourse.state ? `&state=${encodeURIComponent(sbCourse.state)}` : "";
                                const [r1, r2] = await Promise.allSettled([
                                  fetch(`/api/courses2?search=${encodeURIComponent(q)}${stateParam}`).then(r => r.json()),
                                  fetch(`/api/courses?search=${encodeURIComponent(q)}`).then(r => r.json()),
                                ]);
                                const rapidRaw = r1.status === "fulfilled" ? r1.value : [];
                                const gcRaw = r2.status === "fulfilled" ? r2.value : [];
                                // Simple: find best match by name
                                const allApi = [...(Array.isArray(rapidRaw) ? rapidRaw : rapidRaw.courses || []), ...(Array.isArray(gcRaw) ? gcRaw : gcRaw.courses || [])];
                                const match = allApi.find(c => (c.name || c.club_name || "").toLowerCase().includes(q.toLowerCase().split(" ")[0]));
                                if (match) {
                                  setCoursePreview({ ...sbCourse, ...match, id: sbCourse.id, _source: match.source || "API", _freshFetch: true });
                                } else {
                                  // No API match — fall back to local
                                  setCoursePreview({ ...sbCourse, _source: "WBC History" });
                                }
                              } catch {
                                setCoursePreview({ ...sbCourse, _source: "WBC History" });
                              }
                              setSearchLoading(false);
                            }} style={{ flex: 1, padding: "12px 0", borderRadius: R.md, background: "transparent", border: `1px solid ${K.bdr}`, color: K.t2, fontSize: FS.small, fontWeight: 600, cursor: "pointer" }}>
                              🔄 Fetch Fresh
                            </button>
                          </div>
                        </div>
                      </div>
                      </CoursePreviewPortal>
                    );
                  })()}

                  {/* Course preview/confirm modal */}
                  {coursePreview && (() => {
                    const draft = coursePreview;
                    const setDraft = fn => setCoursePreview(prev => fn(prev));
                    const tbs = draft.tee_boxes || [];
                    const hasConflict = !!draft._apiVersion;
                    const ti = { background: K.bg, border: `1px solid ${ac}${ALPHA.hair}`, borderRadius: R.xs, color: K.t1, fontSize: FS.micro, textAlign: "center", width: "100%", padding: "3px 2px", boxSizing: "border-box" };
                    const tiL = { ...ti, textAlign: "left", padding: "3px 5px" };
                    return (
                      <CoursePreviewPortal>
                      <div style={{ position: "fixed", top: 0, bottom: 0, left: 0, right: 0, background: SCRIM, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
                        <div style={{ background: K.card, borderRadius: R.xl, border: `1px solid ${ac}${ALPHA.hair}`, width: "100%", maxWidth: 420, maxHeight: "calc(100vh - 48px)", overflowY: "auto", padding: 0 }}>

                          {/* Header */}
                          <div style={{ padding: "14px 16px 10px", borderBottom: `1px solid ${K.bdr}`, position: "sticky", top: 0, background: K.card, zIndex: 1 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div style={{ flex: 1, marginRight: 8 }}>
                                <input value={draft.name} onChange={e => setDraft(p => ({...p, name: e.target.value}))}
                                  style={{ background: "transparent", border: "none", borderBottom: `1px solid ${ac}${ALPHA.hair}`, color: K.t1, fontSize: FS.lead, fontWeight: 800, width: "100%", padding: "2px 0" }} />
                                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                                  <input value={draft.city} onChange={e => setDraft(p => ({...p, city: e.target.value}))} placeholder="City"
                                    style={{ ...tiL, fontSize: FS.lead, flex: 1 }} />
                                  <select value={draft.state} onChange={e => setDraft(p => ({...p, state: e.target.value}))}
                                    style={{ ...ti, fontSize: FS.label, width: 52 }}>
                                    <option value="">—</option>
                                    {["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"].map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                </div>
                              </div>
                              <button onClick={() => setCoursePreview(null)} style={{ background: "transparent", border: "none", color: K.t3, fontSize: FS.lead, cursor: "pointer", lineHeight: 1 }}>✕</button>
                            </div>

                            {/* Source conflict banner */}
                            {hasConflict && (() => {
                              const sbHasReal = draft._sbHasReal;
                              const apiHasReal = draft._apiHasReal;
                              const sbSlope = draft.tee_boxes?.find(t => parseInt(t.slope) !== 113)?.slope || draft.slope;
                              const apiSlope = draft._apiVersion?.tee_boxes?.find(t => parseInt(t.slope) !== 113)?.slope || draft._apiVersion?.slope;
                              const bothReal = sbHasReal && apiHasReal;
                              const bannerColor = bothReal ? K.gold : "#5b9bd5";
                              const bannerMsg = bothReal
                                ? "⚡ Both sources have real slope data — review each and pick the most accurate:"
                                : "ℹ️ One source has real slope data — selecting the better one:";
                              return (
                                <div style={{ marginTop: 8, padding: "8px 10px", background: `${bannerColor}${ALPHA.wash}`, border: `1px solid ${bannerColor}${ALPHA.hair}`, borderRadius: R.sm }}>
                                  <div style={{ fontSize: FS.micro, color: bannerColor, fontWeight: 700, marginBottom: 6 }}>{bannerMsg}</div>
                                  <div style={{ display: "flex", gap: 6 }}>
                                    <button onClick={() => setDraft(p => { const {_apiVersion, _sbHasReal, _apiHasReal, ...sb} = p; return sb; })}
                                      style={{ flex: 1, padding: "6px 4px", borderRadius: R.sm, background: sbHasReal ? ac + ALPHA.tint : "transparent", border: `1px solid ${sbHasReal ? ac : K.bdr}`, color: sbHasReal ? ac : K.t3, fontSize: FS.micro, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
                                      📦 WBC History
                                      <div style={{ fontSize: FS.micro, fontWeight: 400, color: K.t3, marginTop: 2 }}>{draft.tee_boxes?.length || 0} tees · Slope {sbSlope || "?"}</div>
                                      {sbHasReal && <div style={{ fontSize: FS.micro, color: ac, marginTop: 1 }}>✓ real data</div>}
                                      {!sbHasReal && <div style={{ fontSize: FS.micro, color: "#d4584580", marginTop: 1 }}>placeholder</div>}
                                    </button>
                                    <button onClick={() => setDraft(p => { const api = p._apiVersion; return { ...p, par: api.par, slope: api.slope, rating: api.rating, hole_pars: api.hole_pars, hole_handicaps: api.hole_handicaps, tee_boxes: api.tee_boxes, _apiVersion: undefined, _sbHasReal: undefined, _apiHasReal: undefined }; })}
                                      style={{ flex: 1, padding: "6px 4px", borderRadius: R.sm, background: apiHasReal && !sbHasReal ? ac + ALPHA.tint : "transparent", border: `1px solid ${apiHasReal ? ac : K.bdr}`, color: apiHasReal ? ac : K.t3, fontSize: FS.micro, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
                                      🌐 API (Fresh)
                                      <div style={{ fontSize: FS.micro, fontWeight: 400, color: K.t3, marginTop: 2 }}>{draft._apiVersion?.tee_boxes?.length || 0} tees · Slope {apiSlope || "?"}</div>
                                      {apiHasReal && <div style={{ fontSize: FS.micro, color: ac, marginTop: 1 }}>✓ real data</div>}
                                      {!apiHasReal && <div style={{ fontSize: FS.micro, color: "#d4584580", marginTop: 1 }}>placeholder</div>}
                                    </button>
                                  </div>
                                  <div style={{ fontSize: FS.micro, color: K.t3, marginTop: 5, fontStyle: "italic" }}>You can edit any field after selecting a source</div>
                                </div>
                              );
                            })()}
                            {!hasConflict && draft._incompleteData && (
                              <div style={{ marginTop: 8, padding: "8px 10px", background: "#d4584510", border: "1px solid #d4584540", borderRadius: R.sm, fontSize: FS.micro, color: "#d45845" }}>
                                ⚠ Neither API has complete data for this course. Slope, rating, and tee boxes may be missing or inaccurate — please enter them manually before adding.
                              </div>
                            )}
                            {!hasConflict && !draft._incompleteData && (draft.tee_boxes?.length || 0) < 2 && (
                              <div style={{ marginTop: 8, padding: "8px 10px", background: K.gold + ALPHA.wash, border: `1px solid ${K.gold}${ALPHA.hair}`, borderRadius: R.sm, fontSize: FS.micro, color: K.gold }}>
                                ⚠ Only {draft.tee_boxes?.length || 0} tee box found — most courses have multiple tees. Tap <strong>+ Tee</strong> above to add Black, Blue, White, Red etc. with their ratings and slopes.
                              </div>
                            )}
                            {!hasConflict && !draft._incompleteData && (draft.tee_boxes?.length || 0) >= 2 && (
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                                <div style={{ fontSize: FS.micro, color: K.t3, fontStyle: "italic" }}>Review and edit before adding — tap any field to change it</div>
                                {draft._source && <span style={{ fontSize: FS.micro, background: `${ac}${ALPHA.wash}`, border: `1px solid ${ac}${ALPHA.hair}`, color: ac, borderRadius: R.xs, padding: "1px 6px", fontWeight: 600, flexShrink: 0 }}>{draft._source}</span>}
                                {!draft._source && <span style={{ fontSize: FS.micro, background: "#88888815", border: "1px solid #88888830", color: K.t3, borderRadius: R.xs, padding: "1px 6px", fontWeight: 600, flexShrink: 0 }}>WBC History</span>}
                              </div>
                            )}
                          </div>

                          <div style={{ padding: "12px 16px" }}>

                            {/* Tee Boxes — fully editable */}
                            <div style={{ marginBottom: 14 }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                                <div style={{ fontSize: FS.micro, color: K.t3, fontWeight: 700, textTransform: "uppercase" }}>Tee Boxes</div>
                                <button onClick={() => setDraft(p => ({ ...p, tee_boxes: [...(p.tee_boxes||[]), { name: "", color: "#888888", rating: 72.0, slope: 113, par: 72, yardage: 0 }] }))}
                                  style={{ fontSize: FS.micro, padding: "2px 7px", borderRadius: R.xs, background: "transparent", border: `1px solid ${ac}${ALPHA.line}`, color: ac, cursor: "pointer", fontWeight: 700 }}>+ Tee</button>
                              </div>
                              {tbs.length === 0 && <div style={{ fontSize: FS.label, color: K.warn, marginBottom: 8, fontStyle: "italic" }}>⚠ No tees from API — add them manually below</div>}
                              {/* Column headers */}
                              <div style={{ display: "grid", gridTemplateColumns: "18px 1fr 44px 38px 30px 46px 18px", gap: "3px 4px", fontSize: FS.micro, color: K.t3, fontWeight: 600, marginBottom: 3, paddingLeft: 2 }}>
                                <div/><div>Name</div><div style={{textAlign:"center"}}>Rating</div><div style={{textAlign:"center"}}>Slope</div><div style={{textAlign:"center"}}>Par</div><div style={{textAlign:"center"}}>Yards</div><div/>
                              </div>
                              {tbs.map((tb, i) => (
                                <div key={i} style={{ display: "grid", gridTemplateColumns: "18px 1fr 44px 38px 30px 46px 18px", gap: "3px 4px", marginBottom: 4, alignItems: "center" }}>
                                  <div style={{ position:"relative", width:18, height:18, flexShrink:0 }}>
                                    <div style={{ position:"absolute", inset:0, pointerEvents:"none" }}><TeeColorSwatch color={tb.color} name={tb.name} size={18} style={{ borderRadius: R.xs, width:"100%", height:"100%" }} /></div>
                                    <select value={Object.entries(TEE_COLOR_MAP).find(([,v])=>v===(tb.color||""))?.[0] || "black"}
                                      onChange={e => { const clr = TEE_COLOR_MAP[e.target.value] || "#888888"; setDraft(p => { const t=[...p.tee_boxes]; t[i]={...t[i],color:clr,name:t[i].name||e.target.value.charAt(0).toUpperCase()+e.target.value.slice(1)}; return {...p,tee_boxes:t}; }); }}
                                      style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0, cursor:"pointer", fontSize: FS.small }}>
                                      {[["Black","#2c2c2c"],["Blue","#2d8fd4"],["White","#e8e8e8"],["Gold","#d4a843"],["Red","#9b2335"],["Green","#2d8a4e"],["Silver","#a8b2bd"],["Yellow","#e6c619"],["Orange","#e67e22"],["Purple","#7b2d8b"],["Maroon","#6b1c2a"],["Teal","#1a8a7a"],["Platinum","#c0c0c0"]].map(([n])=><option key={n} value={n.toLowerCase()}>{n}</option>)}
                                    </select>
                                  </div>
                                  <input value={tb.name} onChange={e => setDraft(p => { const t=[...p.tee_boxes]; t[i]={...t[i],name:e.target.value}; return {...p,tee_boxes:t}; })}
                                    style={tiL} placeholder="Name" />
                                  <input value={tb.rating} onChange={e => setDraft(p => { const t=[...p.tee_boxes]; t[i]={...t[i],rating:e.target.value}; return {...p,tee_boxes:t}; })}
                                    style={ti} />
                                  <input value={tb.slope} onChange={e => setDraft(p => { const t=[...p.tee_boxes]; t[i]={...t[i],slope:e.target.value}; return {...p,tee_boxes:t}; })}
                                    style={ti} />
                                  <input value={tb.par} onChange={e => setDraft(p => { const t=[...p.tee_boxes]; t[i]={...t[i],par:e.target.value}; return {...p,tee_boxes:t}; })}
                                    style={ti} />
                                  <input value={tb.yardage} onChange={e => setDraft(p => { const t=[...p.tee_boxes]; t[i]={...t[i],yardage:e.target.value}; return {...p,tee_boxes:t}; })}
                                    style={ti} />
                                  <button onClick={() => setDraft(p => ({...p, tee_boxes: p.tee_boxes.filter((_,j) => j!==i)}))}
                                    style={{ background: "transparent", border: "none", color: K.t3, fontSize: FS.label, cursor: "pointer", padding: 0, lineHeight: 1 }}>✕</button>
                                </div>
                              ))}
                            </div>

                            {/* Scorecard — editable pars & handicaps */}
                            <div style={{ marginBottom: 14 }}>
                              <div style={{ fontSize: FS.micro, color: K.t3, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Scorecard</div>
                              {(draft.hole_pars?.length === 0) && <div style={{ fontSize: FS.label, color: K.warn, marginBottom: 6, fontStyle: "italic" }}>⚠ No hole data from API — enter pars below</div>}
                              {[["Front", 0, 9], ["Back", 9, 9]].map(([lbl, start, count]) => {
                                const pars = (draft.hole_pars || Array(18).fill(4)).slice(start, start+count);
                                const hcps = (draft.hole_handicaps || Array(18).fill(0)).slice(start, start+count);
                                return (
                                  <div key={lbl} style={{ marginBottom: 6 }}>
                                    <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: FS.micro }}>
                                      <div style={{ color: K.t3, fontWeight: 600, padding: "2px 0" }}>Hole</div>
                                      {Array.from({length:count},(_,i) => <div key={i} style={{ textAlign:"center", color:K.t2, fontWeight:700, padding:"2px 0" }}>{start+i+1}</div>)}
                                      <div style={{ textAlign:"center", color:K.t3, fontSize: FS.micro, padding:"2px 0" }}>Tot</div>
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: FS.micro, background: K.inp, borderRadius: R.xs, marginBottom: 1 }}>
                                      <div style={{ color: K.t3, fontWeight: 600, padding: "3px 2px" }}>Par</div>
                                      {Array.from({length:count},(_,i) => (
                                        <input key={i} value={pars[i] ?? ""} onChange={e => setDraft(p => { const hp=[...(p.hole_pars||Array(18).fill(4))]; hp[start+i]=e.target.value; return {...p,hole_pars:hp}; })}
                                          style={{ background:"transparent", border:"none", color:K.t1, fontSize: FS.micro, fontWeight:700, textAlign:"center", width:"100%", padding:"3px 0" }} />
                                      ))}
                                      <div style={{ textAlign:"center", color:ac, fontWeight:800, padding:"3px 0", fontSize: FS.micro }}>{pars.reduce((a,b)=>a+(parseInt(b)||0),0)}</div>
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: FS.micro }}>
                                      <div style={{ color: K.t3, fontWeight: 600, padding: "2px 2px" }}>HCP</div>
                                      {Array.from({length:count},(_,i) => (
                                        <input key={i} value={hcps[i] ?? ""} onChange={e => setDraft(p => { const hh=[...(p.hole_handicaps||Array(18).fill(0))]; hh[start+i]=e.target.value; return {...p,hole_handicaps:hh}; })}
                                          style={{ background:"transparent", border:"none", color:K.t3, fontSize: FS.micro, textAlign:"center", width:"100%", padding:"2px 0" }} />
                                      ))}
                                      <div />
                                    </div>
                                    {(() => {
                                      const activeTee = (draft.tee_boxes || [])[0];
                                      const hy = activeTee?.hole_yards || [];
                                      if (!hy.some(y => y > 0)) return null;
                                      const yds = hy.slice(start, start+count);
                                      const tot = yds.reduce((a,b) => a+(parseInt(b)||0), 0);
                                      return (
                                        <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: FS.micro }}>
                                          <div style={{ color: K.t3, fontWeight: 600, padding: "2px 2px" }}>Yds</div>
                                          {yds.map((y, i) => <div key={i} style={{ textAlign: "center", color: K.t3, padding: "2px 0", fontSize: FS.micro }}>{y || "–"}</div>)}
                                          <div style={{ textAlign: "center", color: K.t3, padding: "2px 0", fontSize: FS.micro }}>{tot || ""}</div>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Action buttons */}
                            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                              <button onClick={() => setCoursePreview(null)} style={{ flex: 1, padding: "10px 0", borderRadius: R.sm, background: "transparent", border: `1px solid ${K.bdr}`, color: K.t3, fontSize: FS.small, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                              <button onClick={() => {
                                const firstTee = draft.tee_boxes?.[0];
                                const finalCourse = {
                                  ...draft,
                                  par: parseInt(firstTee?.par) || draft.par || 72,
                                  slope: parseInt(firstTee?.slope) || draft.slope || 113,
                                  rating: parseFloat(firstTee?.rating) || draft.rating || 72.0,
                                  hole_pars: (draft.hole_pars||[]).map(v => parseInt(v)||4),
                                  hole_handicaps: (draft.hole_handicaps||[]).map(v => parseInt(v)||0),
                                  tee_boxes: (draft.tee_boxes||[]).map(tb => ({...tb, rating:parseFloat(tb.rating)||72.0, slope:parseInt(tb.slope)||113, par:parseInt(tb.par)||72, yardage:parseInt(tb.yardage)||0})),
                                };
                                addCourseToLibrary(finalCourse);
                                setSearchResults(prev => prev.filter(r => r.id !== draft.id));
                                setCoursePreview(null);
                              }} style={{ flex: 2, padding: "10px 0", borderRadius: R.sm, background: ac, border: "none", color: K.bg, fontSize: FS.small, fontWeight: 700, cursor: "pointer" }}>✓ Add Course</button>
                            </div>
                          </div>
                        </div>
                      </div>
                      </CoursePreviewPortal>
                    );
                  })()}
                <div style={{ fontSize: FS.micro, color: K.t3, textAlign: "center", marginTop: 6 }}>Powered by GolfCourseAPI.com · 35,000+ courses</div>
                    </div>
                  )}

                  {/* Clearing the round is not the same as changing it, and it is
                      rare — it lives at the bottom of the picker rather than
                      taking a button slot next to Change and Edit. */}
                  {assigned && (
                    <button onClick={() => { setCourseForRound(editRound, { id: null, name: "" }); closePicker(); }}
                      style={{ width: "100%", padding: "9px 0", background: "transparent", border: "none", borderTop: `1px solid ${K.bdr}`, color: K.t3, fontSize: FS.label, fontWeight: 700, cursor: "pointer" }}>
                      Clear the course for Round {editRound}
                    </button>
                  )}
                </>
              );
            })()}

            {/* ── Nobody plays off the course's default rating ──
                A player with no tee does not fail, they fall through to the
                course's own rating and slope — which is an import default, not
                a box anybody tees off. So the console says who, says what it
                will cost, and offers the fix in the same breath, because the
                answer is almost always "the tee everyone else is on".

                It sits ABOVE the tee assigner rather than inside it: the
                per-player list folds away by default, and a warning that hides
                behind a disclosure is a warning nobody reads. */}
            {assigned && !picking && !locked && st.noTee.length > 0 && (() => {
              const nameOfPid = (pid) => activePlayers.find(p => p.id === pid)?.name || pid;
              // What to put them on: whatever most of the field is already
              // playing, falling back to the course's own default pick.
              const counts = {};
              activePlayers.forEach(p => { const t = (teeData[editRound] || {})[p.id]; if (t) counts[t] = (counts[t] || 0) + 1; });
              const tees = assigned.tee_boxes || [];
              const popular = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
              const fixTee = tees.find(t => t.name === popular)?.name || getDefaultTee(tees)?.name || tees[0]?.name;
              return (
                <div style={{ padding: "10px 14px", background: `${K.danger}${ALPHA.wash}`, borderTop: `1px solid ${K.danger}${ALPHA.hair}`, borderBottom: `1px solid ${K.bdr}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: K.danger, flexShrink: 0 }} />
                    <span style={{ fontSize: FS.label, fontWeight: 800, color: K.danger, letterSpacing: 0.6, textTransform: "uppercase" }}>
                      {st.noTee.length} {st.noTee.length === 1 ? "player has" : "players have"} no tee
                    </span>
                  </div>
                  <div style={{ fontSize: FS.label, color: K.t2, lineHeight: 1.5 }}>
                    {describeMissingTees(st.noTee, nameOfPid)}
                  </div>
                  {fixTee && (
                    <button
                      onClick={() => {
                        const next = { ...(teeData[editRound] || {}) };
                        st.noTee.forEach(pid => { next[pid] = fixTee; });
                        setTeeBulk(editRound, next);
                        if ((teesSaved || {})[editRound]) onTeesModify && onTeesModify(editRound);
                      }}
                      style={{
                        marginTop: 8, padding: "6px 12px", borderRadius: R.sm,
                        background: K.danger, border: "1px solid transparent", color: ON_DANGER,
                        fontSize: FS.label, fontWeight: 700, cursor: "pointer",
                      }}>
                      Put {st.noTee.length === 1 ? "them" : "them all"} on {fixTee}
                    </button>
                  )}
                </div>
              );
            })()}

            {/* ── ASSIGNED: tees, in the same card as the course they belong to ── */}
            {assigned && !picking && (
              <TeeAssigner activePlayers={activePlayers} tRounds={tRounds} courses={courses} teeData={teeData} setTeeBulk={setTeeBulk} finalizedRounds={finalizedRounds} editRound={editRound} teesSaved={teesSaved} onTeesModify={onTeesModify} />
            )}
          </div>
        );
      })()}

      {/* Groups and tee times for this round, under the course and tees they
          are played on. It was its own tab, which split one job across two:
          the round selector, the play date and the course all lived over here,
          and the foursomes that use them lived over there. */}
      {tab === "rounds" && (
        <PairingsEditor key={`${editRound}:${activePlayers.length}`} activePlayers={activePlayers} pairingsData={pairingsData} setPairings={setPairings} tRounds={tRounds} courses={courses} teeTimesData={teeTimesData} setTeeTimesData={setTeeTimesData} roundDates={roundDates} onSetRoundDate={onSetRoundDate} scoringOpen={scoringOpen} onSetScoringOpen={onSetScoringOpen} pairingStrategy={pairingStrategy} onSetPairingStrategy={onSetPairingStrategy} leaderboard={leaderboard} finalizedRounds={finalizedRounds} getPlayerTee={getPlayerTee} editRound={editRound} holeData={holeData} />
      )}

      {/* Discard one player's card for this round. Sits at the bottom of the
          Rounds tab because it is a repair, not part of setup — but in the
          tab scoped to the round it acts on, so "this round" is never
          ambiguous. Only offered for players who have actually posted. */}
      {tab === "rounds" && (() => {
        const posted = activePlayers
          .map(p => ({ p, holes: holesEntered(holeData, p.id, editRound) }))
          .filter(x => x.holes > 0);
        if (posted.length === 0) return null;
        return (
          <div style={{ marginTop: 14 }}>
            <SectionLabel color={K.danger}>Discard a card · Round {editRound}</SectionLabel>
            <Card pad={0} style={{ overflow: "hidden" }}>
              {posted.map(({ p, holes }, i) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: i < posted.length - 1 ? `1px solid ${K.bdr}${ALPHA.hair}` : "none" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: FS.small, fontWeight: 700, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    <div style={{ fontSize: FS.label, color: K.t3 }}>{holes} hole{holes === 1 ? "" : "s"} posted</div>
                  </div>
                  <Btn onClick={async () => {
                    const ok = await confirm({
                      title: `Discard ${p.name}'s round ${editRound}?`,
                      message: `Deletes all ${holes} hole${holes === 1 ? "" : "s"} they have posted for this round. Their roster entry, handicap index and other rounds are untouched.\n\nThey can re-enter the round from the scoring screen afterwards.`,
                      confirmLabel: "Discard",
                      destructive: true,
                    });
                    if (!ok) return;
                    const n = await onDiscardRoundScores(editRound, p.id);
                    notify(`Discarded ${n} hole${n === 1 ? "" : "s"} for ${p.name}`);
                  }} variant="dangerOutline" size="sm" style={{ flexShrink: 0 }}>
                    Discard
                  </Btn>
                </div>
              ))}
            </Card>
            {getRoundStatus(editRound).finalized && (
              <div style={{ fontSize: FS.label, color: K.warn, marginTop: 6, lineHeight: 1.45 }}>
                Round {editRound} is finalized. Discarding a card here removes its scores but does not un-finalize the round.
              </div>
            )}
          </div>
        );
      })()}

      {showFinalizeModal && (
        <div style={{ position: "fixed", top: 0, bottom: 0, left: 0, right: 0, background: SCRIM, zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => setShowFinalizeModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, maxHeight: "80vh", background: K.bg, borderRadius: "16px 16px 0 0", border: `1px solid ${K.bdr}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${K.bdr}`, flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: FS.body, color: K.t1 }}>Finalize Rounds</span>
              <button onClick={() => setShowFinalizeModal(false)} style={{ background: "transparent", border: "none", color: K.t3, fontSize: FS.title, cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ overflowY: "auto", padding: "12px 16px 32px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: FS.label, color: K.t3, marginBottom: 2 }}>
              Finalize a group once all 18 holes are entered and scores are confirmed. Finalized scores are locked on the leaderboard.
            </div>
          {Array.from({ length: NUM_ROUNDS }, (_, i) => i + 1).map(rnd => {
            const rndGroups = (pairingsData || {})[rnd] || [];
            const tr = tRounds.find(t => t.round_number === rnd);
            const courseName = tr ? (courses.find(c => c.id === tr.course_id)?.name || "No course") : "No course";
            if (rndGroups.length === 0) return null;
            return (
              <div key={rnd}>
                <div style={{ fontSize: FS.label, fontWeight: 700, color: K.t3, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                  Round {rnd} · {courseName}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {rndGroups.map((grp, gi) => {
                    const groupKey = `${rnd}_${grp.slice().sort().join(",")}`;
                    const isFinalized = finalizedRounds[groupKey] || finalizedRounds[rnd];
                    const holesComplete = grp.every(pid => {
                      const pd = holeData[`${pid}_${rnd}`] || {};
                      return Object.keys(pd).length === 18 && Object.values(pd).every(s => s > 0);
                    });
                    const holesEntered = grp.reduce((total, pid) => {
                      const pd = holeData[`${pid}_${rnd}`] || {};
                      return Math.max(total, Object.values(pd).filter(s => s > 0).length);
                    }, 0);
                    const playerNames = grp.map(pid => {
                      const p = activePlayers.find(x => x.id === pid);
                      return p ? p.name.split(" ")[0] : pid;
                    }).join(", ");
                    return (
                      <div key={gi} style={{
                        background: isFinalized ? K.acc + ALPHA.wash : K.card,
                        border: `1px solid ${isFinalized ? K.acc + ALPHA.hair : K.bdr}`,
                        borderRadius: R.md, padding: "10px 12px",
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: FS.small, fontWeight: 700, color: K.t1, marginBottom: 2 }}>
                            Group {gi + 1}
                            {isFinalized && <span style={{ marginLeft: 6, fontSize: FS.label, color: K.acc, fontWeight: 700 }}>✓ FINAL</span>}
                          </div>
                          <div style={{ fontSize: FS.label, color: K.t3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{playerNames}</div>
                          <div style={{ fontSize: FS.label, color: holesComplete ? K.ok : K.warn, marginTop: 3 }}>
                            {holesComplete ? "All 18 holes entered" : `${holesEntered}/18 holes entered`}
                          </div>
                        </div>
                        {isFinalized ? (
                          <Btn variant="secondary" size="sm" style={{ color: K.t3, whiteSpace: "nowrap", flexShrink: 0 }}
                            onClick={() => { onUnfinalizeRound(groupKey); notify("Round unfinalized"); }}>↩ Unfinalize</Btn>
                        ) : (
                          <Btn
                            size="sm" style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                            onClick={() => { if (!holesComplete) return; onFinalizeRound(groupKey); notify(`Group ${gi+1} Round ${rnd} finalized`); }}
                            disabled={!holesComplete}
                          >✓ Finalize</Btn>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
            </div>
          </div>
        </div>
      )}

      <PlayerEditor
        editing={editingPlayer}
        set={patch => setEditingPlayer(prev => prev ? { ...prev, ...patch } : prev)}
        onClose={() => setEditingPlayer(null)}
        tPlayers={tPlayers} players={activePlayers}
        memberships={memberships} claims={claims} authUid={authUid}
        holeData={holeData} numRounds={numRounds}
        notify={notify} confirm={confirm} tournamentStarted={tournamentStarted}
        onRemove={removePlayer}
        returning={returningPool}
        onSave={async (v) => {
          if (v.isNew) {
            await addPlayerToTournament(v.name, v.hi, { first_name: v.first, last_name: v.last }, v.pid);
            return;
          }
          await updateName(v.pid, v.name, { first_name: v.first, last_name: v.last });
          // updateHI is the GUARDED path everywhere else in this console. Here
          // the warning has already been shown inside the editor's own
          // confirmation, so this calls the raw writer rather than raising a
          // second dialog saying the same thing.
          if (v.hiChanged) await updateHI(v.pid, v.hi);
          if (v.dir) {
            const res = await onSetDirector(v.dir.uid, v.dir.on);
            if (!res.ok) notify(res.error);
            else notify(v.dir.on ? `${v.name} is a director` : `${v.name} is no longer a director`);
          } else {
            notify(`${v.name} saved`);
          }
        }}
      />

      {/* Single confirmation host for this console — every `await confirm(...)`
          in AdminView and the panels it renders resolves through this one. */}
      <ConfirmModal modal={confirmModal} />
    </div>
  );
}



// ── GATE SCREEN — the tournament password ──
// Three steps to get in, each seen once: sign in with Google or Apple, enter
// the tournament password, then claim your name off the roster. This is the
// middle one, and it is the one that actually decides who can change
// anything.
//
// Signing in proves who you are. It does not prove you were invited — anybody
// can make a Google account, and this app's Firebase config ships in the
// bundle by design. So an account has to present the tournament password and
// be issued a membership document (wbc_accounts/{uid}), which every write in
// the project is gated on.
//
// The check happens in the SECURITY RULES, not here. Submitting writes a
// membership document carrying the typed code, and the database rejects it if
// the code is wrong (src/lib/accounts.js, firestore.rules). Nothing on this
// screen knows the password, so nothing on this screen can leak it — which is
// the difference between this and a client-side password check that anybody
// can walk past with devtools open.
//
// A blank or missing code in wbc_secrets/access means the door is open and
// any password (including none) is accepted. That is the bootstrap, not a
// bug: before anybody has set one there is no way to present the right one.
function GateScreen({ fbUser, onPassed, onCancel }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e?.preventDefault?.();
    if (busy) return;
    setBusy(true); setErr("");
    const res = await joinWithCode(fbUser, code);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    onPassed();
  };

  return (
    <div style={{ minHeight: "var(--app-height, 100dvh)", background: `radial-gradient(ellipse at 20% 50%, #0d1f3c 0%, ${K.bg} 70%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Montserrat', sans-serif", fontVariantNumeric: "lining-nums tabular-nums", padding: 20 }}>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div style={{ width: "100%", maxWidth: 340, textAlign: "center" }}>
        <img src={WBC_LOGO} alt="WBC" style={{ height: 64, margin: "0 auto 16px", display: "block", filter: "drop-shadow(0 4px 16px rgba(34,211,167,0.3))" }} />
        <h1 style={{ fontSize: FS.hero, color: K.t1, margin: "0 0 6px", fontWeight: 800, letterSpacing: "-0.02em" }}>Event password</h1>
        <p style={{ color: K.t2, fontSize: FS.small, margin: "0 0 20px", lineHeight: 1.5 }}>
          Signed in as {fbUser?.email || "your account"}.<br />Ask a director for the password — you&rsquo;ll only need it once.
        </p>
        <form onSubmit={submit}>
          <input
            value={code}
            onChange={e => { setCode(e.target.value); if (err) setErr(""); }}
            // Not type="password": there is no privacy to protect from
            // somebody standing on the same tee box, and a masked field on a
            // phone keyboard is how you get three failed attempts.
            type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            autoComplete="one-time-code" autoFocus
            placeholder="Password"
            style={{
              width: "100%", boxSizing: "border-box", padding: "14px 16px", borderRadius: R.lg,
              textAlign: "center", background: K.inp,
              border: `2px solid ${err ? K.danger : K.bdr}`, color: K.t1,
              // 16px or larger, or iOS Safari zooms the page on focus.
              fontSize: FS.lead, fontWeight: 700, outline: "none", fontFamily: "'Montserrat', sans-serif",
            }} />
          <Btn type="submit" size="lg" block disabled={busy} style={{ marginTop: 14 }}>{busy ? "Checking…" : "Continue"}</Btn>
        </form>
        <div style={{ minHeight: 34, marginTop: 10, fontSize: FS.small, lineHeight: 1.4, fontWeight: 600, color: K.danger }}>{err}</div>
        <Btn variant="ghost" size="sm" onClick={onCancel} disabled={busy} style={{ color: K.t3 }}>
          ← Not now, sign out
        </Btn>
      </div>
    </div>
  );
}

// ── CLAIM SCREEN ──
// Shown after a Google/Apple sign-in when the authenticated Firebase user is
// not yet mapped to a WBC player (no wbc_users doc). The signed-in person picks
// their own name from the unclaimed profiles; picking writes the uid→player_id
// claim and logs them in. No emails are collected ahead of time or matched —
// claiming is always by choosing your name. The player_id is the permanent
// career identity linking to 16 years of history, so this is the moment a real
// person is bound to that identity.
function ClaimScreen({ fbUser, candidates, onClaim, onCancel, busyId }) {
  const email = fbUser?.email || "";
  const displayName = fbUser?.displayName || "";
  return (
    <div style={{ minHeight: "var(--app-height, 100dvh)", background: `radial-gradient(ellipse at 20% 50%, #0d1f3c 0%, ${K.bg} 70%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Montserrat', sans-serif", fontVariantNumeric: "lining-nums tabular-nums", padding: 20 }}>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <img src={WBC_LOGO} alt="WBC" style={{ height: 64, margin: "0 auto 16px", display: "block", filter: "drop-shadow(0 4px 16px rgba(34,211,167,0.3))" }} />
        <h1 style={{ fontSize: FS.hero, color: K.t1, margin: "0 0 6px", fontWeight: 800, letterSpacing: "-0.02em" }}>Claim your profile</h1>
        <p style={{ color: K.t2, fontSize: FS.small, margin: "0 0 4px", lineHeight: 1.5 }}>
          Signed in{displayName ? ` as ${displayName}` : ""}{email ? ` · ${email}` : ""}.
        </p>
        <p style={{ color: K.t3, fontSize: FS.small, margin: "0 0 22px", lineHeight: 1.5 }}>Tap your name to link this sign-in to your WBC history.</p>

        {candidates.length === 0 ? (
          <div style={{ background: K.card, border: `1px dashed ${K.warn}${ALPHA.line}`, borderRadius: R.lg, padding: 24 }}>
            <p style={{ color: K.t2, fontSize: FS.small, margin: 0, lineHeight: 1.6 }}>
              Every player profile has already been claimed. If one of them is you, ask a tournament director to free it up in Firebase, then sign in again.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {candidates.map((p) => {
              const busy = busyId === p.id;
              const initials = p.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
              return (
                <button key={p.id} onClick={() => !busyId && onClaim(p)} disabled={!!busyId}
                  style={{ display: "flex", alignItems: "center", gap: 10, background: K.card, border: `1px solid ${busy ? K.acc : K.bdr}`, borderRadius: R.lg, padding: "12px 12px", cursor: busyId ? "default" : "pointer", color: K.t1, textAlign: "left", opacity: busyId && !busy ? 0.5 : 1, transition: `all ${MOTION}` }}
                  onMouseEnter={(e) => { if (!busyId) { e.currentTarget.style.borderColor = K.acc; e.currentTarget.style.background = K.hover; } }}
                  onMouseLeave={(e) => { if (!busyId) { e.currentTarget.style.borderColor = K.bdr; e.currentTarget.style.background = K.card; } }}>
                  <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: "50%", background: K.acc + ALPHA.wash, border: `1px solid ${K.acc}${ALPHA.line}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS.small, fontWeight: 800, color: K.acc }}>{initials}</span>
                  <span style={{ fontSize: FS.small, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{busy ? "Linking…" : p.name}</span>
                </button>
              );
            })}
          </div>
        )}

        <button onClick={onCancel} disabled={!!busyId} style={{ marginTop: 22, background: "transparent", border: "none", color: K.t3, fontSize: FS.small, fontWeight: 600, cursor: busyId ? "default" : "pointer", opacity: busyId ? 0.5 : 1 }}>
          ← Not now, sign out
        </button>
      </div>
    </div>
  );
}

// Courses in round order, unassigned ones last, alpha within a tie. Pure —
// lives out here so it is not rebuilt on every render, and so the data-load
// effect can call it without depending on where it sits in the component.
const sortCoursesByRound = (list, rounds) => {
  return [...list].sort((a, b) => {
    const ra = rounds.find(r => r.course_id === a.id)?.round_number ?? 99;
    const rb = rounds.find(r => r.course_id === b.id)?.round_number ?? 99;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name); // fallback alpha for unassigned
  });
};

// ── MAIN APP ──
export default function WBCApp() {
  // Session persistence: restore the logged-in user on relaunch so players
  // log in once per device (also needed so push can target the right person).
  const [user, setUser] = useState(() => {
    try { const s = localStorage.getItem("wbc_user"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  useEffect(() => {
    try {
      if (user && !user.isGuest) localStorage.setItem("wbc_user", JSON.stringify(user));
      else localStorage.removeItem("wbc_user");
    } catch {}
  }, [user]);

  // ── Google/Apple auth + prebuild-and-claim state ──
  // claims: uid → player_id (mirror of the wbc_users collection). Its VALUES
  // are the source of truth for which player profiles are already claimed —
  // no redundant `claimed` flag is stored on the player record.
  const [claims, setClaims] = useState({});
  const [fbUser, setFbUser] = useState(null);        // current Firebase Auth user
  const [claimState, setClaimState] = useState(null); // null | { status: "needs-claim", candidates }
  const [claimBusyId, setClaimBusyId] = useState(null);
  const [authMsg, setAuthMsg] = useState("");        // provider sign-in error, shown on login screen

  // ── The door: the tournament-password membership ──
  // wbc_accounts/{uid}, and the only place Admin access comes from, via its
  // `is_director` flag. `undefined` while the answer is in flight, which has
  // to stay distinguishable from null: showing the password screen to
  // somebody who is already through it, because a read had not landed yet,
  // would be its own bug. null means signed in but not a member.
  //
  // The answer is stored WITH the account it is about, in one value, because
  // the two must never disagree. Keeping only the document meant the answer
  // for "nobody is signed in" (null) was indistinguishable from "the read came
  // back no" — and auth resolving changes fbUser one render BEFORE the effect
  // below can start the new read. For that one render a returning player had a
  // truthy fbUser sitting next to a stale null, which is exactly the shape the
  // gate below tests for, so the password screen painted at somebody who was
  // already through it. Comparing the answer's uid against the current one
  // makes that window read as "still in flight", which is what it is.
  const [membershipAnswer, setMembershipAnswer] = useState({ uid: undefined, doc: null });
  const membership = membershipAnswer.doc;
  const member = resolveMember(membershipAnswer, fbUser?.uid);

  // Ask the door. A FAILED read is not a "no" — a phone coming up on bad
  // signal must not be told its password is needed again — so it retries
  // before giving an answer. If it still cannot tell, it falls through to the
  // password screen rather than hanging forever: that screen re-checks
  // membership on submit, so somebody who is already through gets waved past
  // as soon as the network returns.
  const loadMembership = useCallback(async (uid) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return { ok: true, doc: await readMembership(uid) }; }
      catch (e) {
        console.error("[gate] membership check", e);
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    return { ok: false, doc: null };
  }, []);

  useEffect(() => {
    if (!AUTH_PROVIDERS_ENABLED) { setMembershipAnswer({ uid: fbUser ? fbUser.uid : null, doc: null }); return; }
    if (!fbUser) { setMembershipAnswer({ uid: null, doc: null }); return; }
    let live = true;
    // No "in flight" write needed — the answer already fails the uid check
    // above the moment fbUser changes, so it reads as unresolved for free.
    (async () => {
      const { doc: m } = await loadMembership(fbUser.uid);
      if (live) setMembershipAnswer({ uid: fbUser.uid, doc: m });
    })();
    return () => { live = false; };
  }, [fbUser, loadMembership]);

  // Account sheet (log out / delete account). Delete is only offered to users
  // who actually signed in with a provider (fbUser set) — that's the "account"
  // the app stores require to be deletable. PIN-only players have no such
  // account to delete. deleteStage: null | "confirm" | "working".
  const [accountOpen, setAccountOpen] = useState(false);
  // Light or dark. The VALUE lives in theme.js (K is mutated in place, so every
  // call site repaints); this state exists only to make React re-render when it
  // changes — the palette is not React's to own.
  const [theme, setThemeState] = useState(getTheme);
  const pickTheme = (name) => { setThemeState(setTheme(name)); };
  const [menuOpen, setMenuOpen] = useState(false);
  // Every year the tournament has been run in this app. A sheet rather than a
  // view because opening one RELOADS the app onto that edition (see
  // lib/editions.js), so there is nothing to route back from.
  const [editionsOpen, setEditionsOpen] = useState(false);
  // The bar's real height, measured rather than guessed: the menu sits flush
  // on top of it, and the bar's height moves with the device's bottom inset.
  const navRef = useRef(null);
  const [navH, setNavH] = useState(62);
  // Measured, so useLayoutEffect — same reason as the leaderboard's column
  // sizing: a measure-then-restyle in useEffect paints the guessed 62px first
  // and the real height a frame later.
  useLayoutEffect(() => {
    const measure = () => { if (navRef.current) setNavH(navRef.current.offsetHeight); };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);
  const [deleteStage, setDeleteStage] = useState(null);
  const [deleteErr, setDeleteErr] = useState("");
  // handleDeleteAccount is defined further down, AFTER notify() exists — see note there.

  // The three ways out of the sheet — the backdrop, the ✕, and a swipe down —
  // all land here, so "closing" means one thing and the confirm stage can
  // never be left armed behind a closed sheet.
  const closeAccount = () => { setAccountOpen(false); setDeleteStage(null); };
  // A deletion in flight is the one state with no way out: the backdrop is
  // already inert while it runs, and the ✕ is hidden, so the swipe goes too.
  const accountDrag = useSheetDrag({ onClose: closeAccount, enabled: deleteStage !== "working" });

  // iOS standalone height fix, enforced from React. --app-height = window.innerHeight
  // (which excludes the home-indicator area that 100dvh wrongly includes). This
  // mirrors index.html but also runs after React mounts — critical now that a
  // persisted login mounts the constrained main view on first paint, before iOS
  // has settled the standalone viewport. Without it, the view can lock to a wrong
  // height (fat top gap + clipped bottom nav).
  useEffect(() => {
    // Is a text field focused — i.e. is the on-screen keyboard up? Drives the
    // shrink guard below. Must mirror index.html.
    const isEditing = () => {
      const el = document.activeElement;
      if (!el || el === document.body) return false;
      if (el.isContentEditable) return true;
      return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || "");
    };
    const setAppHeight = (allowShrink = false) => {
      try {
        // GUARD: on iOS PWA cold-reopen/resume, window.innerHeight is briefly 0
        // (or an unstable tiny value) during the launch transition. Writing that
        // into --app-height collapses the fixed-height, overflow:hidden app
        // container to nothing — the "flash then dark blank screen" bug. Ignore
        // any non-sane measurement and keep the last good value (or the CSS
        // 100dvh fallback) so the view can never collapse. 100px floor is safe:
        // no real device viewport is shorter. Must mirror index.html.
        const h = window.innerHeight;
        if (!(h > 100)) return;
        // KEYBOARD GUARD: opening the on-screen keyboard shrinks innerHeight and
        // fires resize. Believing it collapses the app container the same way —
        // the bottom nav rides up into the middle of the screen with a black band
        // beneath it — and the grow-back resize does NOT reliably arrive when the
        // keyboard closes. Dismissing it by unmounting the field is the case that
        // strands it: save a course name in Admin and the editor (and its input)
        // disappear, so the height stays shrunk with no keyboard left to explain
        // it. While a field owns focus --app-height may grow but never shrink; a
        // genuine shrink while typing (rotation) still lands via the orientation
        // handler, which passes allowShrink, and via the re-measure after blur.
        const prev = parseFloat(document.documentElement.style.getPropertyValue("--app-height")) || 0;
        if (!allowShrink && prev && h < prev && isEditing()) return;
        document.documentElement.style.setProperty("--app-height", h + "px");
      } catch {}
    };
    // iOS scrolls the DOCUMENT to reveal a focused field even though html/body
    // are overflow:hidden, and does not always scroll back when the keyboard
    // goes — which lifts the whole app off the bottom of the screen and looks
    // identical to the collapse above. Nothing in this app scrolls the document
    // (every scroller is an inner pane), so pinning it back to 0 is always safe.
    const unscroll = () => {
      if (isEditing()) return; // don't fight iOS while it reveals the field
      try {
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
      } catch {}
    };
    const settle = (allowShrink = false) => { setAppHeight(allowShrink); unscroll(); };
    // Tracked, self-clearing timeouts: these fire on every blur and rotation for
    // the life of the app, so they must not pile up in the pending set.
    const timers = new Set();
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
    setAppHeight();
    [100, 300, 600].forEach(ms => later(() => setAppHeight(), ms));
    const onResize = () => settle(false);
    // Rotation overrides the shrink guard: the field usually keeps focus across
    // it, and the delays let the new viewport settle first.
    const onOrient = () => { [200, 500].forEach(ms => later(() => settle(true), ms)); };
    // Keyboard going away. Deliberately NOT allowShrink — moving between two
    // fields also fires focusout with the keyboard still up, and there the guard
    // (which only blocks while something is focused) is exactly what we want.
    const onFocusOut = () => { [50, 300, 700].forEach(ms => later(() => settle(false), ms)); };
    const onVis = () => { if (document.visibilityState === "visible") later(() => settle(false), 100); };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onOrient);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrient);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  const [view, setView] = useState("leaderboard");
  const [round, setRound] = useState(1);
  // ── The director's crown ──
  // Which group the Scoring tab is pointed at, reported up by OnCourseScoring,
  // and the pick that points it somewhere else. Both live up here because the
  // crown that reads them is app CHROME: it rides in the header, above every
  // tab, and the header knows nothing about a round being scored. The pick
  // carries a sequence number so the screen below can apply it exactly once —
  // see the effect there.
  const [scoringGroup, setScoringGroup] = useState(null);
  const [directorPick, setDirectorPick] = useState(null);
  const pickSeq = useRef(0);
  const [notif, setNotif] = useState(null);
  // Kept next to the state it drives, and above every caller: several hook
  // dependency arrays name `notify`, and those are evaluated during render.
  const notify = m => { setNotif(m); setTimeout(() => setNotif(null), 2500); };

  // Set favicon. The APP MARK, matching index.html, the header and the
  // pull-to-refresh spinner — the trophy is the award, not the identity.
  // index.html already ships the same href; this runs anyway because a
  // previously-cached tab can be holding the old one.
  useEffect(() => {
    const link = document.querySelector("link[rel*='icon']") || document.createElement("link");
    link.type = "image/png"; link.rel = "shortcut icon"; link.href = WBC_FAVICON;
    document.head.appendChild(link);
    const apple = document.querySelector("link[rel='apple-touch-icon']") || document.createElement("link");
    apple.rel = "apple-touch-icon"; apple.href = WBC_FAVICON;
    document.head.appendChild(apple);
  }, []);

  // Set viewport meta to prevent zoom on mobile
  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      document.head.appendChild(meta);
    }
    meta.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';

    // Inject global style to prevent iOS zoom on inputs
    const style = document.createElement('style');
    style.textContent = `
      body { touch-action: manipulation; -ms-touch-action: manipulation; }
      * { -webkit-text-size-adjust: 100%; }
      input:focus, select:focus, textarea:focus { font-size: 16px !important; }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  const [tPlayers, setTPlayers] = useState([]);
  const [tRounds, setTRounds] = useState([]);
  const [courseList, setCourseList] = useState([]);
  // The photo library's index for the active edition. See src/lib/media.js —
  // these documents point at the photos, they do not contain them.
  const [media, setMedia] = useState([]);
  // wbc_config/photos — the budget circuit breaker's flag. Null until read.
  const [photoConfig, setPhotoConfig] = useState(null);
  // ── The career registry, as state ──
  // DEMO_PLAYERS holds the same rows, but it is a module-level variable that
  // nothing re-renders on — which is fine for names read during a render and
  // useless for anything a screen has to react to. The Players tab reads
  // `index_override` off here and writes it back, so it needs the real thing.
  const [registry, setRegistry] = useState([]);
  const [holeData, setHoleData] = useState({});
  const [ctpData, setCtpData] = useState({});
  // Every player's market portfolio, one entry per bettor. See rowsToMarket.
  const [marketBets, setMarketBets] = useState([]);
  // The three side games' money, from tournament_state.side_games. Each `in`
  // is an ARRAY of player ids, or NULL when no director has ever touched it —
  // and null means everybody, which is what every tournament played before
  // this existed was. An empty array is a different answer (nobody), so the
  // two must not be collapsed. See components/BuyIns.
  const [sideGames, setSideGames] = useState({
    skins: { amount: 0, in: null, pot: 0, paid: [] },
    ctp: { amount: 0, in: null, paid: [] },
    lownet: { amount: 0, in: null, paid: [] },
    market: { amount: 0, in: null, paid: [] },
    rebuy: { amount: 0, in: null, paid: [] },
  });
  const [pairingsData, setPairingsData] = useState({});
  const [teeData, setTeeData] = useState({});
  // Recorded course handicaps, for imported editions only — empty for the
  // running tournament. Loaded from the same rows as teeData because it rides
  // on them; see rowsToCourseHandicaps.
  const [courseHandicaps, setCourseHandicaps] = useState({});
  const [teesSaved, setTeesSaved] = useState({});
  const [teesModified, setTeesModified] = useState({});
  const [teeTimesData, setTeeTimesData] = useState({});
  const [finalizedRounds, setFinalizedRounds] = useState({});
  const [roundDates, setRoundDates] = useState({});   // { round: "YYYY-MM-DD" } — scheduled play date
  const [scoringOpen, setScoringOpen] = useState({}); // { round: true } — director force-open override
  const [pairingStrategy, setPairingStrategy] = useState({}); // { round: { mode, leadersLast } } — per-round auto-pairing method
  // Two-phase scorecard signing/attestation state, keyed by groupKey.
  // { [groupKey]: { signedBy, signedByName, attestedBy: [pids], signedAt } }
  const [scorecardSigs, setScorecardSigs] = useState({});
  // Just-signed / just-attested flash guard. When we optimistically write a
  // sig locally, we also stash it here with an expiry. The subscription
  // callback overlays these onto the docs-derived map, so a stale Firestore
  // snapshot arriving between our write and its echo can't clear the entry
  // and cause the UI to flash back to "unsigned" for a frame. Cleared
  // automatically once the doc round-trip confirms the same state.
  const pendingSigsRef = useRef(new Map()); // groupKey -> { sig, expiresAt }
  const mergePendingSigs = (fromDocs) => {
    const m = { ...fromDocs };
    const now = Date.now();
    pendingSigsRef.current.forEach((entry, k) => {
      if (entry.expiresAt < now) { pendingSigsRef.current.delete(k); return; }
      const echoed = m[k];
      if (!echoed) { m[k] = entry.sig; return; }
      // Sig doc present. Merge attest arrays (union), keep other fields
      // from the echoed doc since it's the authoritative signer state.
      const optimisticAttest = entry.sig.attestedBy || [];
      const echoedAttest = echoed.attestedBy || [];
      const hasAll = optimisticAttest.every(pid => echoedAttest.includes(pid));
      if (hasAll) {
        // Fully echoed — drop the pending entry.
        pendingSigsRef.current.delete(k);
      } else {
        m[k] = { ...echoed, attestedBy: [...new Set([...echoedAttest, ...optimisticAttest])] };
      }
    });
    return m;
  };
  // Auto-advance round when finalization changes
  useEffect(() => {
    setRound(r => {
      if (!finalizedRounds[r]) return r;
      for (let i = 1; i <= NUM_ROUNDS; i++) { if (!finalizedRounds[i]) return i; }
      return NUM_ROUNDS;
    });
  }, [JSON.stringify(finalizedRounds)]);
  const [adminSettingsOpen, setAdminSettingsOpen] = useState(false);
  const [adminSettingsTab, setAdminSettingsTab] = useState("players");
  // Which round the deep link is about, when it is about one (scoring's "no
  // course set for Round 3" card). Null means "wherever admin was".
  const [adminSettingsRound, setAdminSettingsRound] = useState(null);
  // Editable event setup — { name, location, rounds }. Null until a director
  // saves one, at which point it overrides the TOURNAMENT constant everywhere
  // the event is named. Lives on the existing tournament_state doc rather than
  // in a collection of its own: it is one more piece of the same singleton,
  // and a new collection would need its own firestore.rules entry.
  const [tournamentMeta, setTournamentMeta] = useState(null);
  const tournamentName = tournamentMeta?.name || TOURNAMENT.name;
  const tournamentLocation = tournamentMeta?.location || "";

  // When the field tees off — round one's earliest tee time. The same instant
  // the market's opening bell rings, off the same derivation, so the header
  // and the Betting tab can never be counting to two different moments.
  // Null until the round has both a date and a tee sheet, which is what keeps
  // a countdown off a tournament nobody has scheduled yet.
  //
  // Up here beside the location because both render branches want it: the
  // guest leaderboard gets the same header, and a spectator waiting on the
  // first tee is the person most likely to be watching a countdown to it.
  const firstTeeAt = teeOffAt(roundDates[1], (teeTimesData[1] || []).map(teeTimeToMinutes));

  // Point the module-level NUM_ROUNDS at the saved count, DURING render rather
  // than from an effect. Everything below — and every child this render is
  // about to produce — reads that binding while rendering, so an effect would
  // paint one frame of a four-round leaderboard for a three-round event. The
  // assignment is idempotent and derived purely from state, which is what
  // makes it safe to do here.
  const numRounds = clampRounds(tournamentMeta?.rounds);
  if (NUM_ROUNDS !== numRounds) setRoundCount(numRounds);

  // Every group in every round — what the director's crown lists. Kept here
  // rather than inside the header's JSX so the same array decides whether the
  // crown appears at all: with one group there is nothing to switch to.
  const switchableGroupList = useMemo(
    () => switchableGroups(pairingsData, numRounds),
    [pairingsData, numRounds]
  );

  // The tab title follows the saved tournament name, so renaming the event in
  // the Event settings tab renames the browser tab too. Kept here rather than up
  // with the other one-shot document effects: the dependency array is evaluated
  // during render, so it has to sit below tournamentName's declaration or it
  // reads a const in its temporal dead zone and throws on first paint.
  useEffect(() => { document.title = tournamentName; }, [tournamentName]);

  // Shortening the event can strand the app on a round that no longer exists —
  // a director on Round 4 who switches to three would otherwise keep looking at
  // a scoring screen nothing else counts. Same reason this is here and not
  // beside the auto-advance effect further up: `numRounds` is declared above,
  // and a dep array is evaluated during render.
  useEffect(() => { setRound(r => Math.min(r, numRounds)); }, [numRounds]);
  const [storageLoaded, setStorageLoaded] = useState(false);

  // ── Pull-to-refresh ──
  // Two jobs, and the first is the reason it exists at all: an installed PWA
  // has no address bar, so a player running a stale bundle has no way to pick
  // up a new deploy. hasNewBundle diffs the hashed asset URLs and reloads.
  //
  // The second is the collections that are NOT live. Most of this app arrives
  // over onSnapshot — scores, pairings, tee assignments, skins, signatures,
  // roster, tournament state — so it needs no refreshing. But `players`,
  // `tournament_rounds`, `courses` and `tee_boxes` are read once at mount:
  // they change only when a director edits them, which is rare, and paying for
  // four more live listeners on every device would be a poor trade. The cost
  // is that a course assigned mid-trip doesn't reach anyone else's phone until
  // they relaunch. This is the pull that fixes that.
  const refreshStaticData = useCallback(async () => {
    const playerRows = await db.get("players");
    if (playerRows?.length) {
      DEMO_PLAYERS = playerRows
        .map(r => ({ id: r.id, name: r.name, first_name: r.first_name || "", last_name: r.last_name || "", index_override: r.index_override ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setRegistry(DEMO_PLAYERS);
      // DEMO_PLAYERS is module-level, so replacing it does not by itself
      // re-render anything that reads it. Nudge the state the roster derives
      // from so activePlayers/allPlayers recompute against the new names.
      setTPlayers(prev => [...prev]);
    }

    const trRows = await db.get("tournament_rounds", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }]);
    const sortedTRounds = (trRows || []).sort((a, b) => a.round_number - b.round_number);
    if (!sortedTRounds.length) return;
    setTRounds(sortedTRounds.map(r => ({ id: r.id, tournament_id: r.tournament_id, round_number: r.round_number, course_id: r.course_id })));

    const courseIds = sortedTRounds.map(r => r.course_id).filter(Boolean);
    if (!courseIds.length) return;
    const cRows = await db.get("courses", [{ field: "id", op: "in", value: courseIds }]);
    if (!cRows?.length) return;
    const tbRows = await db.get("tee_boxes", [{ field: "course_id", op: "in", value: courseIds }]);
    const coursesWithTees = cRows.map(c => ({
      ...c,
      hole_pars: c.hole_pars || [],
      hole_handicaps: c.hole_handicaps || [],
      tee_boxes: (tbRows || []).filter(t => t.course_id === c.id).map(t => ({ name: t.name, color: t.color, rating: parseFloat(t.rating), slope: parseInt(t.slope), par: parseInt(t.par), yardage: parseInt(t.yardage) })),
    }));
    setCourseList(sortCoursesByRound(coursesWithTees, sortedTRounds));
  }, []);

  const { pullY, refreshing: pullRefreshing, PULL_THRESHOLD } = usePullToRefresh({
    hasNewBundle,
    onRefresh: refreshStaticData,
  });

  // ── Load all data from Firestore on mount ──
  //
  // Two halves, and the split is the whole point of this block.
  //
  // READ ONCE: `players`, `tournament_rounds`, `courses`, `tee_boxes`. A
  // director edits these rarely, so four more live listeners on every phone
  // would be a poor trade; pull-to-refresh is what picks up a mid-trip change
  // (see refreshStaticData).
  //
  // SUBSCRIBED: everything else. A listener delivers a FULL initial snapshot
  // the moment it attaches, so it is already the load — which is why this
  // block no longer also db.get()s hole_scores, pairings, tee_assignments,
  // skins, tournament_state and tournament_players. Fetching them twice cost
  // three things and bought none:
  //
  //   • double the billed reads on every cold start, on the collection set
  //     that dominates them — hole_scores alone is 12 × 4 × 18 documents;
  //   • two parsers per collection, one incremental and one wholesale, free
  //     to drift apart;
  //   • a race. The read was never awaited before the listeners attached, so
  //     whichever landed second replaced the other's state wholesale, and the
  //     loser could be the newer answer.
  //
  // It also worked against the persistent cache firebase.js goes to some
  // trouble to enable: getDocs asks the SERVER, while a listener resumes from
  // its stored token and is sent only what changed since this phone last had
  // it. On the collections that matter the listener is strictly cheaper.
  useEffect(() => {
    // The registry, as a promise. The roster bootstrap below needs it and the
    // two now arrive on different clocks — this one over a one-shot read, the
    // roster over its subscription — so the seeding awaits it rather than
    // racing it.
    const registryReady = (async () => {
      const playerRows = await db.get("players");
      if (playerRows?.length) {
        DEMO_PLAYERS = playerRows
          .map(r => ({ id: r.id, name: r.name, first_name: r.first_name || "", last_name: r.last_name || "", index_override: r.index_override ?? null }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setRegistry(DEMO_PLAYERS);
      }
      return playerRows || [];
    })();
    registryReady.catch(e => console.error("Registry load failed:", e));

    (async () => {
      try {
        // Existing uid→player_id claims (wbc_users). Doc id is the uid.
        // DEFERRED (non-blocking): this feeds only the claim flow, which is
        // inert while AUTH_PROVIDERS_ENABLED is false. It used to sit here as an
        // awaited call BETWEEN players and the tournament data below, delaying
        // rounds/courses/scores by a full round-trip on every cold start (and
        // longer if wbc_users reads are denied by rules). On a reopen — where
        // the leaderboard mounts at t=0 with no login screen to buy load time —
        // that widened the empty-data window for no benefit. Fire-and-forget so
        // it can never gate the render-critical tournament payload.
        db.get(USERS_COLLECTION).then(userRows => {
          if (userRows?.length) {
            setClaims(Object.fromEntries(userRows.map(r => [r.uid || r.id, r.player_id]).filter(([u, pid]) => u && pid)));
          }
        }).catch(e => console.warn("[claims] wbc_users load skipped:", e?.message || e));

        const trRows = await db.get("tournament_rounds", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }]);
        const sortedTRounds = (trRows || []).sort((a, b) => a.round_number - b.round_number);
        if (sortedTRounds.length) setTRounds(sortedTRounds.map(r => ({ id: r.id, tournament_id: r.tournament_id, round_number: r.round_number, course_id: r.course_id })));

        const courseIds = sortedTRounds.map(r => r.course_id).filter(Boolean);
        if (courseIds.length) {
          const cRows = await db.get("courses", [{ field: "id", op: "in", value: courseIds }]);
          if (cRows?.length) {
            const tbRows = await db.get("tee_boxes", [{ field: "course_id", op: "in", value: courseIds }]);
            const coursesWithTees = cRows.map(c => ({
              ...c,
              hole_pars: c.hole_pars || [],
              hole_handicaps: c.hole_handicaps || [],
              tee_boxes: (tbRows || []).filter(t => t.course_id === c.id).map(t => ({ name: t.name, color: t.color, rating: parseFloat(t.rating), slope: t.slope, par: t.par, yardage: t.yardage })),
            }));
            setCourseList(sortCoursesByRound(coursesWithTees, sortedTRounds));
          }
        }
      } catch(e) { console.error("Load failed:", e); }
    })();

    // ── Real-time subscriptions via Firestore onSnapshot ──
    const unsubs = [];

    // Scores, applied as CHANGES rather than rebuilt. See lib/holeScores for
    // why the fold lives there — the short version is that a deletion is as
    // much a fact about a card as a score is, and this handler used to drop
    // them on the floor: a discarded round vanished on the director's phone
    // and stayed on everybody else's until they relaunched.
    unsubs.push(db.subscribe("hole_scores", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }], (docs, changes) => {
      const normalized = (changes || []).map(c => ({ type: c.type, row: c.doc.data() }));
      setHoleData(prev => applyScoreChanges(prev, normalized));
    }));

    unsubs.push(db.subscribe("pairings", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }], (docs) => {
      const sorted = docs.sort((a, b) => a.round_number - b.round_number || a.group_number - b.group_number || (a.player_id || "").localeCompare(b.player_id || ""));
      setPairingsData(rowsToPairings(sorted));
      // The SHEET wins, and the rows fill only what it has never known: a
      // director's tee sheet lives on tournament_state now, and a pairing row
      // is a copy of it made when the draw was written. Reading them the other
      // way round let a row written before the sheet — or one belonging to a
      // group that has since emptied — put a blank back over a real time.
      setTeeTimesData(prev => mergeTeeTimes(rowsToTeeTimes(sorted), prev));
    }));

    unsubs.push(db.subscribe("tee_assignments", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }], (docs) => {
      setTeeData(rowsToTeeData(docs));
      setCourseHandicaps(rowsToCourseHandicaps(docs));
    }));

    // CTP is tournament-wide, so a tag from Group 1's phone has to reach Group 4's phone
    // before they hit that par 3 — otherwise the leader bar shows nothing to beat and
    // the last group in wins by default. Live subscription, same as scores.
    unsubs.push(db.subscribe("skins", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }], (docs) => {
      setCtpData(rowsToCtp(docs));
      setMarketBets(rowsToMarket(docs));
    }));

    unsubs.push(db.subscribe("tournament_state", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }], (docs) => {
      if (docs?.length) {
        if (docs[0].finalized_rounds) setFinalizedRounds(docs[0].finalized_rounds);
        if (docs[0].tees_saved) setTeesSaved(docs[0].tees_saved);
        if (docs[0].tees_modified) setTeesModified(docs[0].tees_modified);
        if (docs[0].round_dates) setRoundDates(docs[0].round_dates);
        if (docs[0].tee_times) setTeeTimesData(prev => mergeTeeTimes(prev, docs[0].tee_times));
        if (docs[0].scoring_open) setScoringOpen(docs[0].scoring_open);
        if (docs[0].pairing_strategy) setPairingStrategy(docs[0].pairing_strategy);
        if (docs[0].meta) setTournamentMeta(docs[0].meta);
        if (docs[0].side_games) setSideGames(mergeSideGames(docs[0].side_games));
      }
    }));

    // Sign/attest lives in its own collection (one doc per group) so the
    // onScorecardSigned Cloud Function gets a clean per-group CREATE trigger.
    // Rebuild the in-memory map the UI reads from these docs, then overlay
    // any optimistic entries that haven't been echoed back yet (flash guard).
    unsubs.push(db.subscribe("wbc_scorecard_sigs", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }], (docs) => {
      const fromDocs = {};
      docs.forEach(d => {
        const k = d.groupKey || d.id;
        fromDocs[k] = { signedBy: d.signedBy, signedByName: d.signedByName, attestedBy: d.attestedBy || [], present: d.present || [] };
      });
      setScorecardSigs(mergePendingSigs(fromDocs));
    }));

    // ── The roster, and the one-time bootstrap under it ──
    //
    // This listener's FIRST snapshot is also the answer to "does this edition
    // have a roster yet", which is what the seeding below keys on — so it no
    // longer needs a one-shot read of its own to ask.
    //
    // `rosterSeeded` keeps the seeding a one-time act. Without it, a director
    // who legitimately empties the roster would have it re-filled from the
    // registry on the very next snapshot.
    //
    // It is also what `storageLoaded` means now: `lb` is built from the
    // roster, so "the roster has answered" is exactly the question the
    // leaderboard's empty state has to have answered before it can say "no
    // scores yet" rather than flashing that at somebody mid-load.
    let rosterSeeded = false;
    unsubs.push(db.subscribe("tournament_players", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }], (docs) => {
      setTPlayers(docs.map(r => ({ id: r.id, tournament_id: r.tournament_id, player_id: r.player_id, handicap_index: parseFloat(r.handicap_index) || 0, status: r.status || "active" })));
      setStorageLoaded(true);
      if (docs.length || rosterSeeded || !isDefaultEdition()) return;
      rosterSeeded = true;
      // One-time bootstrap for the ORIGINAL edition only: lift the global
      // player registry into a roster the first time this edition loads
      // without one.
      //
      // Gated on isDefaultEdition() because a NEW edition legitimately has
      // no roster — that is what "start blank" means. Without the guard,
      // creating an empty 2027 and switching to it would silently import
      // every golfer who has ever played, at index 0, and the director
      // would have to work out which ones to delete.
      // Seeded from the WBC Index, not from zero. The index computed off a
      // golfer's own history is the source of truth for what they play
      // off; a roster that starts everybody at scratch makes the director
      // type fourteen numbers that the app already knows, and a missed one
      // is a player scoring gross by accident. Admin can still override
      // any of them — that is what the Index field there is for.
      registryReady.then(playerRows => {
        if (!playerRows?.length) return;
        const seeded = playerRows.map(r => {
          const hist = matchHistoryName(r);
          const seedIdx = hist ? indexFor(hist, { override: r.index_override ?? null }).index : null;
          return { id: docIds.tournamentPlayer(_e(), r.id), tournament_id: TOURNAMENT_ID, player_id: r.id, handicap_index: seedIdx ?? 0, status: "active" };
        });
        setTPlayers(seeded);
        // One commit, not fourteen: the listener above republishes on every
        // one of them, so a per-row loop paints the roster filling in a name
        // at a time. See db.upsertMany.
        return db.upsertMany("tournament_players", seeded);
      }).catch(e => console.error("Roster bootstrap failed:", e));
    }, () => setStorageLoaded(true)));

    // Whether photo uploads are switched on. One tiny document, subscribed
    // with the rest because every phone needs it and it never changes — see
    // onBudgetAlert in functions/index.js, which only writes it on a
    // transition precisely so this listener stays quiet.
    unsubs.push(db.subscribe("wbc_config", [], (docs) => {
      setPhotoConfig(docs.find(d => d.id === "photos") || null);
    }));

    return () => unsubs.forEach(u => u && u());
  }, []);

  // ── The photo index, subscribed only once somebody opens Photos ──
  // Deliberately NOT in the block above. Every other subscription there is
  // bounded by the shape of a tournament — twelve players, four rounds,
  // eighteen holes — but this one grows with however many photos get posted,
  // and Firestore bills a read per document each time a listener attaches.
  //
  // The app has no persistent cache, so every cold start re-reads everything
  // it subscribes to. Attaching this on load would mean a phone that never
  // opens the gallery still paying for the whole index on each launch, times
  // twelve phones, times however often a phone reloads over a tournament
  // weekend. Mounting it on first open instead makes the cost proportional to
  // people actually looking at photos.
  //
  // `photosOpened` latches: once opened, the subscription stays for the rest
  // of the session, so coming back to the gallery is instant and posting a
  // photo still shows up live on every phone that has it open.
  const [photosOpened, setPhotosOpened] = useState(false);
  useEffect(() => { if (view === "photos") setPhotosOpened(true); }, [view]);
  useEffect(() => {
    if (!photosOpened) return;
    return db.subscribe("wbc_media", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }], (docs) => {
      setMedia(docs);
    });
  }, [photosOpened]);

  // Save tournament state to Firestore
  // Written on its own rather than through saveTournamentState: that helper
  // takes seven positional arguments and rewrites all of them, so threading an
  // eighth through every existing call site to change a name would be a much
  // bigger edit than the feature. db.upsert merges, so this touches only `meta`.
  const saveTournamentMeta = async (meta) => {
    setTournamentMeta(meta);
    await db.upsert("tournament_state", {
      id: `ts_${TOURNAMENT_ID}`,
      tournament_id: TOURNAMENT_ID,
      meta,
      updated_at: new Date().toISOString(),
    });
  };

  // ── The photo library's two writes ──
  // Both go through lib/mediaUpload.js, which owns the canvas work and the
  // bucket; this pair owns the Firestore side, because `db` lives here and a
  // second write path into wbc_media is how two of them drift apart.
  //
  // The order matters in both directions and is the opposite each time:
  //
  //   uploading  bytes first, then the index document. A document pointing at
  //              a photo that failed to upload is a broken tile in the grid;
  //              bytes with no document are invisible and cost 250KB.
  //   deleting   document first, then the bytes. The document is what makes
  //              the photo exist in the app, so removing it is what the person
  //              tapping Remove actually asked for — and if the byte delete
  //              then fails, the result is a hidden orphan rather than a photo
  //              that is still on screen after being deleted.
  const onUploadPhoto = async (file, onProgress) => {
    const uid = fbUser?.uid;
    if (!uid) throw new Error("You need to be signed in to add photos.");
    const { uploadPhoto } = await import("./lib/mediaUpload");
    const row = await uploadPhoto({
      file,
      onProgress,
      slug: _e(),
      uid,
      uploaderName: user?.name || "",
      // Tagged with the round in play, but only when posting into the LIVE
      // edition — a photo added while browsing 2014 has no business claiming
      // to be from round 2 of it. Inside the live tournament the guess is
      // right far more often than not and saves a picker on a screen somebody
      // is using one-handed on a tee box. A dinner photo landing under the
      // round it was taken during is a wrong label, not a lost photo.
      round: isDefaultEdition() ? round : null,
    });
    await db.upsert("wbc_media", row);
  };

  const onDeletePhoto = async (item) => {
    if (!item?.id) return;
    await db.deleteDoc("wbc_media", item.id);
    const { deletePhotoBytes } = await import("./lib/mediaUpload");
    await deletePhotoBytes(item);
  };

  const saveTournamentState = async (finalized, savedTees, modTees, rDates, sOpen, pStrat, tTimes) => {
    const tsSaved = savedTees !== undefined ? savedTees : teesSaved;
    const tsMod = modTees !== undefined ? modTees : teesModified;
    const rd = rDates !== undefined ? rDates : roundDates;
    const so = sOpen !== undefined ? sOpen : scoringOpen;
    const ps = pStrat !== undefined ? pStrat : pairingStrategy;
    const tt = tTimes !== undefined ? tTimes : teeTimesData;
    await db.upsert("tournament_state", {
      id: `ts_${TOURNAMENT_ID}`,
      tournament_id: TOURNAMENT_ID,
      finalized_rounds: finalized,
      tees_saved: tsSaved,
      tees_modified: tsMod,
      round_dates: rd,
      scoring_open: so,
      pairing_strategy: ps,
      // The tee sheet. It used to live ONLY on the pairing rows, which meant a
      // group with nobody in it had nowhere to keep its time — see the writer
      // in AdminView. It is a per-round admin setting like round_dates, and it
      // belongs beside them, independent of who is drawn into which group.
      tee_times: tt,
      updated_at: new Date().toISOString(),
    });
  };


  const startFresh = async () => {
    // Clear scores, rounds, pairings, tees — keep tournament_players (roster + HIs)
    try {
      await db.delete("hole_scores", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }]);
      await db.delete("pairings", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }]);
      await db.delete("tee_assignments", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }]);
      await db.delete("tournament_rounds", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }]);
      await db.delete("tournament_state", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }]);
      await db.delete("skins", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }]);
      await db.delete("wbc_scorecard_sigs", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }]);
      await db.delete("wbc_rounds_state", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }]);
    } catch(e) { console.error("Start fresh clear failed:", e); }
    // Keep tPlayers (roster + HIs) intact — clear everything else
    setTRounds([]);
    setCourseList([]);
    setHoleData({});
    setCtpData({});
    // The side games go with the scorecards: the `skins` delete above took the
    // CTP tags AND every market portfolio, and the tournament_state delete took
    // the buy-in lists. Resetting them here keeps the screen agreeing with what
    // is left in Firestore instead of showing a pot nobody has bought into.
    setMarketBets([]);
    setSideGames(mergeSideGames(null));
    setPairingsData({});
    setTeeData({});
    setTeeTimesData({});
    setTeesSaved({});
    setTeesModified({});
    setFinalizedRounds({});
    setScorecardSigs({});
    setRoundDates({});
    setScoringOpen({});
    setPairingStrategy({});
    setRound(1);
    await saveTournamentState({}, {}, {}, {}, {}, {});
    // The event setup is not scorecard data. Deleting tournament_state above
    // takes `meta` down with it, so the name, location and round count have to
    // be written back onto the document saveTournamentState just recreated —
    // otherwise clearing the scores quietly renames the event and puts a
    // three-round year back to four.
    if (tournamentMeta) await saveTournamentMeta(tournamentMeta);
    notify("Scorecards cleared — player roster preserved");
  };

  // Account deletion.
  const handleDeleteAccount = useCallback(async () => {
    setDeleteErr("");
    setDeleteStage("working");
    try {
      await deleteAccount(user?.id);
      // Free the profile locally so it's immediately re-claimable. deleteAccount
      // already removed the wbc_users doc server-side, but claimedPlayerIds is
      // derived from the in-memory `claims` map (loaded once on mount), so we
      // must drop any uid→player_id entry pointing at the deleted player here —
      // otherwise the profile still looks claimed and won't show on the claim
      // roster until a full app reload.
      const freedPlayerId = user?.id;
      if (freedPlayerId) {
        setClaims(prev => Object.fromEntries(
          Object.entries(prev).filter(([, pid]) => pid !== freedPlayerId)
        ));
      }
      // deleteAccount clears the native provider session; also clear the web
      // session + local state so we land cleanly on the login screen.
      try { await doSignOut(); } catch { /* non-fatal */ }
      try { localStorage.removeItem("wbc_user"); } catch { /* non-fatal */ }
      setAccountOpen(false);
      setDeleteStage(null);
      setUser(null);
      notify("Your account has been deleted");
    } catch (e) {
      setDeleteStage("confirm");
      setDeleteErr(e?.message || "Couldn't delete your account. Please try again.");
    }
  }, [user, notify]);

  // ── Push notifications (client) ──
  const [notifPerm, setNotifPerm] = useState(() => (typeof Notification !== "undefined" ? Notification.permission : "denied"));

  // Foreground push → in-app banner (SW handles background).
  useEffect(() => {
    if (!user || user.isGuest) return;
    let unsub;
    (async () => {
      try {
        const supported = await isMessagingSupported().catch(() => false);
        if (!supported) return;
        const messaging = getMessaging(_app);
        unsub = onMessage(messaging, (payload) => {
          const d = payload.data || {};
          const msg = d.title ? (d.body ? `${d.title} — ${d.body}` : d.title) : d.body;
          if (msg) notify(msg);
        });
      } catch {}
    })();
    return () => { if (unsub) unsub(); };
  }, [user]);

  // Keep this device's token fresh + mapped to the logged-in player when
  // permission is already granted, so a re-login re-registers silently.
  //
  // GUARDED on the cached subscription status, which is the whole reason that
  // cache exists as a tri-state. Browser permission stays "granted" forever
  // once given — including for somebody who has since turned notifications OFF
  // in settings — so an unguarded re-register would silently resubscribe them
  // on their next login and the toggle would appear not to work. `false` means
  // they said no on this device; `null` means we have never asked here, which
  // is the case this effect is for.
  useEffect(() => {
    if (!user || user.isGuest) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (getCachedSubscriptionStatus(user.id) === false) return;
    registerForPush(user.id);
  }, [user]);

  // App badge = scorecards this player still owes an attestation on. This is
  // the source of truth that reconciles the SW's optimistic badge increments.
  useEffect(() => {
    if (!user || user.isGuest) return;
    let count = 0;
    Object.values(scorecardSigs || {}).forEach(s => {
      if ((s.present || []).includes(user.id) && s.signedBy !== user.id && !(s.attestedBy || []).includes(user.id)) count++;
    });
    try {
      if (navigator.setAppBadge) { count > 0 ? navigator.setAppBadge(count) : (navigator.clearAppBadge && navigator.clearAppBadge()); }
      navigator.serviceWorker?.controller?.postMessage({ type: "SET_BADGE", count });
    } catch {}
  }, [scorecardSigs, user]);

  // Deep-link: a notification tap lands on /#scoring or /#leaderboard.
  useEffect(() => {
    const applyHash = () => {
      const h = (window.location.hash || "").replace("#", "");
      const map = { scoring: "scoring", leaderboard: "leaderboard", board: "leaderboard", pairings: "groups", groups: "groups", betting: "skins", skins: "skins", admin: "admin", photos: "photos" };
      if (map[h]) setView(map[h]);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  const activePlayers = useMemo(() => {
    return tPlayers.filter(tp => tp.status !== "WD").map(tp => {
      const p = DEMO_PLAYERS.find(pl => pl.id === tp.player_id);
      return p ? { ...p, handicap_index: parseFloat(tp.handicap_index) || 0, tp_id: tp.id } : null;
    }).filter(Boolean).sort((a,b) => a.name.localeCompare(b.name));
  }, [tPlayers]);

  // All players including WD — used for leaderboard display
  const allPlayers = useMemo(() => {
    return tPlayers.map(tp => {
      const p = DEMO_PLAYERS.find(pl => pl.id === tp.player_id);
      return p ? { ...p, handicap_index: parseFloat(tp.handicap_index) || 0, tp_id: tp.id, isWD: tp.status === "WD" } : null;
    }).filter(Boolean).sort((a,b) => a.name.localeCompare(b.name));
  }, [tPlayers]);

  // ── Claim flow ──
  // Set of player_ids already bound to a Firebase uid (single source of truth
  // is the claims map's values).
  const claimedPlayerIds = useMemo(() => new Set(Object.values(claims)), [claims]);

  // Write the uid→player_id claim and log the person in. Optimistic: local
  // state updates immediately so the UI advances, then the Firestore writes
  // follow. `method` records how the claim was resolved ("email" | "manual").
  const claimProfile = useCallback(async (fb, player, method) => {
    if (!fb || !player) return;
    const email = (fb.email || "").toLowerCase();
    const rec = {
      id: fb.uid, uid: fb.uid, tournament_id: TOURNAMENT_ID,
      player_id: player.id, email, displayName: fb.displayName || player.name,
      providers: (fb.providerData || []).map(p => p.providerId),
      method, claimedAt: Date.now(),
    };
    setClaims(prev => ({ ...prev, [fb.uid]: player.id }));
    setClaimBusyId(null);
    setClaimState(null);
    setUser({ id: player.id, name: player.name, isDirector: isDirectorAccount(membership) });
    // The only record written is the uid→player_id claim (wbc_users). We do NOT
    // stamp the email onto the shared players profile — emails are never
    // collected ahead of time or stored on tournament profiles; a player simply
    // picks their name at sign-in.
    await db.upsert(USERS_COLLECTION, rec).catch(e => console.warn("[claim] wbc_users write failed", e));
    // `membership` is read for the isDirector seed above. Only ever called
    // from the claim screen's onClick, so a changing identity costs nothing.
  }, [membership]);

  // Subscribe to Firebase Auth. Also completes any pending redirect sign-in
  // (installed-PWA path) that resolves on cold start. Entirely skipped while
  // providers are disabled — no redirect/iframe machinery runs on cold start
  // until the feature is live.
  useEffect(() => {
    if (!AUTH_PROVIDERS_ENABLED) return;
    consumeRedirectResult().catch(e => setAuthMsg(e?.message || "Sign-in failed."));
    const unsub = onAuthStateChanged(_auth, u => setFbUser(u));
    return unsub;
  }, []);

  // Resolve a signed-in Firebase user to a WBC player: already-claimed fast
  // path → manual "pick your name". No email matching — a player claims their
  // profile by choosing their name. Waits until the registry and existing
  // claims have loaded so it never mis-decides "unclaimed".
  useEffect(() => {
    if (!fbUser) { setClaimState(null); return; }
    // The door comes before the claim. Claiming a name is a write, and the
    // rules gate it on the membership document existing, so offering the
    // roster to somebody who has not been through the password screen would
    // just be a grid of names whose every tap is refused.
    if (member !== true) { setClaimState(null); return; }
    if (!storageLoaded) return;

    // 1. Already claimed → log straight in (idempotent; guarded against loops).
    const claimedPid = claims[fbUser.uid];
    if (claimedPid) {
      const p = DEMO_PLAYERS.find(pl => pl.id === claimedPid);
      if (p) {
        setClaimState(null);
        if (user?.id !== p.id) setUser({ id: p.id, name: p.name, isDirector: isDirectorAccount(membership) });
        return;
      }
      // Claimed to a player_id no longer in the registry — fall through to re-claim.
    }

    // 2. Manual "pick your name" (immediate link per CLAIM_REQUIRES_APPROVAL=false).
    const unclaimed = activePlayers.filter(p => !claimedPlayerIds.has(p.id));
    setClaimState({ status: "needs-claim", candidates: unclaimed });
  }, [fbUser, member, membership, claims, claimedPlayerIds, storageLoaded, activePlayers, user]);

  // ── Admin access rides on the MEMBERSHIP flag ──
  // `is_director` on wbc_accounts/{uid} is the only thing the security rules
  // will honour, so it has to be the only thing the app reads too — otherwise
  // a phone can show an Admin tab whose every write comes back refused, which
  // looks like the app is broken rather than like a permission problem.
  //
  // There was a DIRECTOR_IDS list here as a transition fallback, for the
  // window between this code landing and the two membership documents
  // actually carrying `is_director`. Those documents carry it now and
  // firestore.rules is enforcing, so the list is gone: a director on a
  // hardcoded list but not on the flag would get an Admin tab whose every
  // write comes back refused, which reads as a broken app rather than as a
  // permission problem. One source of truth, and it is the one the database
  // checks.
  //
  // Getting the crown back if the set is ever emptied is a Firebase console
  // edit on wbc_accounts — by design. Nothing in the app can appoint the
  // first director, because the rule requires one to already exist.
  useEffect(() => {
    if (!user || user.isGuest) return;
    const flag = isDirectorAccount(membership);
    if (user.isDirector !== flag) setUser(u => (u ? { ...u, isDirector: flag } : u));
  }, [membership, user]);

  // Every membership, but only for a director — the rules allow the listing to
  // nobody else, and nobody else has a screen that needs it. Subscribed rather
  // than fetched so appointing somebody updates the row you just tapped.
  const [memberships, setMemberships] = useState([]);
  useEffect(() => {
    if (!user?.isDirector) { setMemberships([]); return; }
    return subscribeMemberships(setMemberships);
  }, [user?.isDirector]);

  const onSetDirector = useCallback(async (uid, on) => setDirector(uid, on), []);

  // Provider sign-in handlers for the login screen.
  const handleGoogleSignIn = useCallback(async () => {
    setAuthMsg("");
    try { await doGoogleSignIn(); } catch (e) { setAuthMsg(e?.message || "Google sign-in failed."); }
  }, []);
  const handleAppleSignIn = useCallback(async () => {
    setAuthMsg("");
    try { await doAppleSignIn(); } catch (e) { setAuthMsg(e?.message || "Apple sign-in failed."); }
  }, []);

  // Unified logout: clear the Firebase session too, or the auth listener would
  // immediately re-resolve and log the person back in. Safe no-op for PIN-only
  // and guest users (no Firebase session to clear).
  const handleLogout = useCallback(async () => {
    setClaimState(null);
    setClaimBusyId(null);
    try { await doSignOut(); } catch { /* non-fatal */ }
    setUser(null);
  }, []);


  // Get a player's tee box for a round (returns tee object or null)
  // Null for the running tournament, which is what sends the board to calcCH.
  const getPlayerCH = (rnd, pid) => {
    const ch = courseHandicaps[rnd]?.[pid];
    return Number.isFinite(ch) ? ch : null;
  };

  const getPlayerTee = (rnd, pid, course) => {
    if (!course || !course.tee_boxes || course.tee_boxes.length === 0) return null;
    const assigned = (teeData[rnd] || {})[pid];
    if (assigned) {
      const tee = course.tee_boxes.find(t => t.name === assigned);
      if (tee) return tee;
    }
    return getDefaultTee(course.tee_boxes) || course.tee_boxes[0];
  };

  // The board, ranked best → worst. Both halves come from lib/individualBoard
  // so the standings players read and the order the `leaderboard` pairing mode
  // draws from are provably the same number — see that module's header for why
  // this is not computed here any more.
  // Who has taken the market's halfway rebuy. Derived from the bets, never
  // tagged — see lib/market rebuyers. It is computed HERE rather than only
  // inside the Betting tab because the Admin price sheet bills for it too,
  // and a count taken from the stored (unused) `in` list would have told the
  // director a different number to the one the pot is counted from.
  const rebuyIds = useMemo(() => {
    const inMarket = new Set(fieldFor(sideGames?.market?.in, allPlayers).map(p => p.id));
    return rebuyers(eligibleBets({ bets: marketBets, inMarket: pid => inMarket.has(pid) }));
  }, [sideGames, allPlayers, marketBets]);

  const getLeaderboard = useMemo(() =>
    rankIndividualBoard(computeIndividualBoard({
      players: allPlayers,
      numRounds,
      holeData,
      tRounds,
      courses: courseList,
      getPlayerTee,
      getPlayerCH,
    })),
  [allPlayers, tRounds, courseList, holeData, teeData, courseHandicaps, numRounds]);

  const onSaveHole = async (pid, rnd, holeIdx, score) => {
    // Optimistic update
    setHoleData(prev => {
      const key = `${pid}_${rnd}`;
      return { ...prev, [key]: { ...(prev[key] || {}), [holeIdx]: score } };
    });
    // Persist to Firestore
    const tr = tRounds.find(t => t.round_number === rnd);
    const row = holeDataToRow(pid, rnd, holeIdx, score, tr?.course_id);
    await db.upsert("hole_scores", row);
  };

  // Mark player as WD: set status, fill all unfilled holes in current and future rounds with sentinel 99
  const markPlayerWD = async (pid) => {
    const tr = tRounds.find(t => t.round_number === round);
    const key = `${pid}_${round}`;
    const existing = holeData[key] || {};
    const updates = [];
    for (let h = 0; h < 18; h++) {
      if (!(existing[h] > 0)) updates.push(holeDataToRow(pid, round, h, 99, tr?.course_id));
    }
    setHoleData(prev => {
      const existing = prev[key] || {};
      const filled = { ...existing };
      for (let h = 0; h < 18; h++) { if (!(filled[h] > 0)) filled[h] = 99; }
      return { ...prev, [key]: filled };
    });
    const tp = tPlayers.find(t => t.player_id === pid);
    if (tp) await db.upsert("tournament_players", { ...tp, status: "WD" }, "id");
    setTPlayers(prev => prev.map(tp => tp.player_id === pid ? { ...tp, status: "WD" } : tp));
    for (const row of updates) await db.upsert("hole_scores", row);
    notify(`Player withdrawn from tournament`);
  };

  const setCourseForRound = async (rnd, course) => {
    if (course.id) {
      setCourseList(prev => prev.find(c => c.id === course.id) ? prev : [...prev, course]);
      // Upsert course to Firestore
      const { tee_boxes, ...courseData } = course;
      await db.upsert("courses", courseData);
      // Upsert tee boxes
      if (tee_boxes?.length) {
        for (const tb of tee_boxes) {
          const { hole_yards: hy2, _source: _s2, color: _c2, ...tbData2 } = tb;
          const tbPayload2 = {
            id: `tb_${course.id}_${(tb.name || "default").toLowerCase().replace(/\s+/g,"_")}`,
            course_id: course.id,
            color: tb.color || _c2,
            name: tbData2.name, rating: tbData2.rating, slope: tbData2.slope,
            par: tbData2.par, yardage: tbData2.yardage || 0,
          };
          if (Array.isArray(hy2) && hy2.some(y => y > 0)) tbPayload2.hole_yards = hy2;
          await db.upsert("tee_boxes", tbPayload2);
        }
      }
    }
    const trRow = { id: docIds.tournamentRound(_e(), rnd), tournament_id: TOURNAMENT_ID, round_number: rnd, course_id: course.id || null };
    setTRounds(prev => {
      const existing = prev.find(t => t.round_number === rnd);
      const updated = existing
        ? prev.map(t => t.round_number === rnd ? { ...t, course_id: course.id } : t)
        : (course.id ? [...prev, trRow] : prev);
      setTimeout(() => setCourseList(cl => sortCoursesByRound(cl, updated)), 800);
      return updated;
    });
    // Only upsert to Firestore if assigning a real course
    if (course.id) {
      await db.upsert("tournament_rounds", trRow);
    }
    // Auto-assign default tee
    if (course.id && course.tee_boxes?.length) {
      const defaultTee = getDefaultTee(course.tee_boxes);
      if (defaultTee) {
        const bulk = {};
        activePlayers.forEach(p => { bulk[p.id] = defaultTee.name; });
        setTeeData(prev => ({ ...prev, [rnd]: bulk }));
        const rows = activePlayers.map(p => ({ id: docIds.teeAssignment(_e(), rnd, p.id), tournament_id: TOURNAMENT_ID, round_number: rnd, player_id: p.id, tee_name: defaultTee.name }));
        await db.upsertMany("tee_assignments", rows);
      }
    }
  };

  const addCourse = async (course) => {
    if (course._delete) {
      // Remove from tournament's active course list (local state only)
      // Do NOT delete from Firestore — courses collection is a permanent library
      setCourseList(prev => prev.filter(c => c.id !== course.id));
      notify("Course removed from tournament");
      return;
    }
    // Strip all internal UI flags and tee_boxes before saving course row
    const { tee_boxes, _incompleteData, _apiVersion, _sbVersion, _gcVersion,
            _sbHasReal, _apiHasReal, _rapidHasReal, _gcHasReal, _source, _freshFetch, ...rawCourseData } = course;
    // Ensure course has a stable id
    const courseId = rawCourseData.id || `course_${Date.now()}`;
    const courseData = { ...rawCourseData, id: courseId };
    // Save course FIRST and wait for it before saving tee boxes (foreign key requirement)
    const now = new Date().toISOString();
    // `currentUser` is AdminView's name for this — in here it's `user`. The old
    // `typeof currentUser !== "undefined"` guard meant this always fell through
    // to "Unknown", so no course edit was ever attributed.
    const savedBy = user?.name || "Unknown";
    await db.upsert("courses", { ...courseData, updated_at: now, updated_by: savedBy }, "id");
    if (tee_boxes?.length) {
      let tbErrors = 0;
      for (const tb of tee_boxes) {
        const { color: _c, _source: _s, ...tbData } = tb;
        const tbPayload = {
          id: `tb_${courseId}_${(tb.name || "default").toLowerCase().replace(/\s+/g,"_")}`,
          course_id: courseId,
          color: tb.color,
          name: tbData.name,
          rating: tbData.rating,
          slope: tbData.slope,
          par: tbData.par,
          yardage: tbData.yardage || 0,
        };
        if (Array.isArray(tb.hole_yards) && tb.hole_yards.some(y => y > 0)) {
          tbPayload.hole_yards = tb.hole_yards;
        }
        try {
          await db.upsert("tee_boxes", tbPayload);
        } catch(tbErr) {
          console.error("Tee box save failed:", tbErr, tbPayload);
          tbErrors++;
        }
      }
      if (tbErrors > 0) {
        notify(`⚠ Course saved but ${tbErrors} tee box${tbErrors > 1 ? "es" : ""} failed to save — open and re-save to retry`);
      }
    }
    // Update local state with clean version (always, even if tee saves had errors)
    const cleanCourse = { ...courseData, tee_boxes: tee_boxes || [] };
    setCourseList(prev => sortCoursesByRound(
      prev.find(c => c.id === courseId) ? prev.map(c => c.id === courseId ? cleanCourse : c) : [...prev, cleanCourse],
      tRounds
    ));
    notify(`Added ${course.name}`);
  };

  // Returns the derived player id so the caller can key anything else it needs
  // to write for the new player off the SAME value rather than re-deriving it
  // and risking the two drifting apart.
  //
  // `existingId` is the returning-player path: an id read off a record that
  // already exists, which must be used AS IT IS rather than re-derived. A
  // legacy row's id and its display name do not have to agree, and deriving
  // over the top of one would file a man beside himself — new roster row, same
  // name, and his account claim still pointing at the record he has left.
  const addPlayerToTournament = async (name, hi, parts = null, existingId = null) => {
    const id = existingId ? String(existingId) : name.toLowerCase().replace(/\s+/g, "_");
    const rec = { id, name, ...(parts || {}) };
    if (!DEMO_PLAYERS.find(p => p.id === id)) DEMO_PLAYERS.push({ ...rec });
    else Object.assign(DEMO_PLAYERS.find(p => p.id === id), rec);
    await db.upsert("players", rec, "id").catch(() => {});
    const newTp = { id: docIds.tournamentPlayer(_e(), id), tournament_id: TOURNAMENT_ID, player_id: id, handicap_index: hi, status: "active" };
    setTPlayers(prev => [...prev, newTp]);
    await db.upsert("tournament_players", newTp);
    // Seed default tee assignments
    const teeUpdates = [];
    tRounds.forEach(tr => {
      const course = courseList.find(c => c.id === tr.course_id);
      if (!course) return;
      const defaultTee = getDefaultTee(course.tee_boxes);
      if (!defaultTee) return;
      teeUpdates.push({ id: docIds.teeAssignment(_e(), tr.round_number, id), tournament_id: TOURNAMENT_ID, round_number: tr.round_number, player_id: id, tee_name: defaultTee.name });
    });
    if (teeUpdates.length) {
      setTeeData(prev => {
        const updated = { ...prev };
        teeUpdates.forEach(u => { updated[u.round_number] = { ...(updated[u.round_number] || {}), [id]: u.tee_name }; });
        return updated;
      });
      for (const row of teeUpdates) await db.upsert("tee_assignments", row);
    }
    await saveTournamentState(finalizedRounds);
    return id;
  };

  // ── Discard one player's round ──
  // Ported from Bourbon Cup. The fix for the two things that actually go wrong
  // on a scorecard: somebody enters a round against the wrong name, or a group
  // signs a card that turns out to be wrong. Before this the only remedy was
  // "Start Fresh", which wipes the whole tournament.
  //
  // Deletes by the STORED document id, so it clears whatever id scheme the row
  // was written under — the pre-editions bare `2026` ids and the edition-slug
  // ids both — falling back to rebuilding the id only if a row somehow lacks
  // one. Returns the number of holes removed so the caller can report it.
  //
  // ONE commit for the whole card. A per-hole delete loop is eighteen commits,
  // and every phone in the field publishes a repaint on each of them — the
  // discarded round visibly erodes a hole at a time on somebody else's
  // leaderboard. Batched, it is gone everywhere in one frame.
  const onDiscardRoundScores = async (round, pid) => {
    const rows = await db.get("hole_scores", [
      { field: "tournament_id", op: "==", value: TOURNAMENT_ID },
      { field: "player_id", op: "==", value: pid },
      { field: "round_number", op: "==", value: round },
    ]);
    const ids = (rows || []).map(r => r.id || docIds.holeScore(_e(), round, pid, (r.hole_number || 1) - 1));
    if (ids.length) await db.replaceMany("hole_scores", [], ids);
    // The subscription now says the same thing a moment later — it applies
    // removals, which is what it did not used to do — so this is only about
    // the panel that raised the action not re-rendering against a stale card
    // in the meantime.
    setHoleData(prev => { const n = { ...prev }; delete n[`${pid}_${round}`]; return n; });
    return ids.length;
  };

  const updateHI = async (pid, newHI) => {
    setTPlayers(prev => prev.map(tp => tp.player_id === pid ? { ...tp, handicap_index: newHI } : tp));
    const tp = tPlayers.find(t => t.player_id === pid);
    if (tp) await db.upsert("tournament_players", { ...tp, handicap_index: newHI }, "id");
  };

  // ── The hand-set WBC Index ──
  // A career-level number, so it lives on the `players` registry rather than on
  // this year's tournament_players row: an index a director corrects is a fact
  // about the golfer, not about the edition, and putting it on the edition
  // would mean setting it again every year.
  //
  // It is NOT the same number as `handicap_index` above. That one is the index
  // this tournament is played off and is locked once cards are in (see the
  // handicap-edit guard in AdminView); this one is what the Players tab
  // publishes as the golfer's WBC Index. Setting this does not move anybody's
  // course handicap or reshuffle a leaderboard.
  //
  // `null` clears it and the computed index comes back.
  const setIndexOverride = async (pid, value) => {
    const v = value == null || String(value).trim() === "" ? null : Number(value);
    const next = v != null && Number.isFinite(v) ? v : null;
    DEMO_PLAYERS = DEMO_PLAYERS.map(p => p.id === pid ? { ...p, index_override: next } : p);
    setRegistry(DEMO_PLAYERS);
    await db.upsert("players", { id: pid, index_override: next }, "id");
  };

  // `name` is the DISPLAY name ("Aaron J") that every screen outside the admin
  // console renders, and it stays the source of truth for those. first_name /
  // last_name are the full parts, edited only in the player editor, and the
  // display name is derived from them unless a nickname overrides it.
  const updateName = async (pid, newName, parts = null) => {
    const patch = { id: pid, name: newName, ...(parts || {}) };
    const p = DEMO_PLAYERS.find(pl => pl.id === pid);
    if (p) Object.assign(p, patch);
    else DEMO_PLAYERS.push({ ...patch });
    setTPlayers(prev => [...prev]); // trigger re-render
    await db.upsert("players", patch, "id").catch(() => {});
  };

  // ── Move a player to inactive ──
  // "Remove" is what it does to the EDITION — the tournament_players row and
  // this year's pairings — and the name has stayed that way because that is
  // still the write. What it has never done is remove a player: the `players`
  // record, the career id behind it and every historical round are untouched,
  // which is why the button that calls this says "Move to inactive" and why
  // the Players tab lists him under that heading afterwards.
  const removePlayer = async (pid) => {
    const tp = tPlayers.find(t => t.player_id === pid);
    setTPlayers(prev => prev.filter(tp => tp.player_id !== pid));
    if (tp) await db.deleteDoc("tournament_players", tp.id);
    // Remove from pairings
    setPairingsData(prev => {
      const updated = {};
      Object.keys(prev).forEach(rnd => {
        updated[rnd] = prev[rnd].map(grp => grp.filter(id => id !== pid)).filter(grp => grp.length > 0);
      });
      return updated;
    });
    await db.delete("pairings", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }, { field: "player_id", op: "==", value: pid }]);
    notify("Moved to inactive");
  };

  // Compute gross skin wins for scorecard highlighting: { "round_holeIdx": playerId }
  // Gross skin wins for scorecard highlighting: { "round_holeIdx": playerId }.
  //
  // Computed through lib/sideGames, the same function the Betting tab runs, so
  // a gold circle on the leaderboard's card is provably the same skin the
  // Betting tab is paying for. It also respects the skins buy-in list: a hole
  // won by somebody who is not in the game is not a skin, and highlighting it
  // as one would put a circle on the board that the money disagrees with.
  const skinWins = useMemo(() => {
    const field = fieldFor(sideGames?.skins?.in, activePlayers);
    const wins = {};
    for (let r = 1; r <= numRounds; r++) {
      const tr = tRounds.find(t => t.round_number === r);
      const rCourse = tr ? courseList.find(c => c.id === tr.course_id) : null;
      if (!rCourse) continue;
      computeSkins({ players: field, holeData, round: r, pars: rCourse.hole_pars || [] })
        .filter(s => s.winner)
        .forEach(s => { wins[`${r}_${s.hole}`] = s.winner.pid; });
    }
    return wins;
  }, [activePlayers, holeData, tRounds, courseList, numRounds, sideGames]);

  // Tag / re-tag the tournament-wide CTP for a par 3. One doc per round+hole, so a
  // closer ball from a later group overwrites the standing tag.
  //
  // distance_ft is written EXPLICITLY (null when unknown) rather than omitted: db.upsert
  // uses setDoc(merge:true), so an omitted field would silently retain the previous
  // player's distance and attach it to the new winner. The tagging GROUP is written the
  // same way and for the same reason: a director's override off the Betting tab carries
  // no group, and inheriting the last group's tee order would have the prompt telling
  // the next group the field is out of order on the strength of a stale field.
  const onSetCtp = async (rnd, hole, pid, distanceFt = null, taggedGroup = null) => {
    const ft = (distanceFt === null || distanceFt === undefined || distanceFt === "") ? null : Number(distanceFt);
    const distance = ft ? `${ft} ft` : "";
    const taggedByName = user?.name || "";
    const taggedGroupKey = taggedGroup?.key || null;
    const taggedGroupOrder = Number.isInteger(taggedGroup?.order) ? taggedGroup.order : null;
    setCtpData(prev => ({
      ...prev,
      [rnd]: { ...(prev[rnd] || {}), [hole]: { playerId: pid, distanceFt: ft, distance, taggedByName, taggedGroupKey, taggedGroupOrder, confirmedBy: [] } },
    }));
    // Store CTP as a skin type in the skins table.
    // tournament_id was previously MISSING — which meant these docs were invisible to
    // every tournament-scoped query (including Start Fresh's cleanup) and could never
    // be loaded back. That's why CTPs evaporated on reload.
    const tr = tRounds.find(t => t.round_number === rnd);
    await db.upsert("skins", {
      id: docIds.ctp(_e(), rnd, hole),
      tournament_id: TOURNAMENT_ID,
      tournament_round_id: tr?.id || null,
      round_number: rnd,
      hole_number: hole,
      player_id: pid,
      skin_type: "ctp",
      distance_ft: ft,
      distance,
      tagged_by: user?.id || null,
      tagged_by_name: taggedByName,
      tagged_group_key: taggedGroupKey,
      tagged_group_order: taggedGroupOrder,
      tagged_at: new Date().toISOString(),
      // Cleared, not merged: a confirmation was agreement with a distance
      // that has just been beaten, and carrying it onto the new tag would
      // show groups signing off a number they never saw.
      confirmed_by: [],
    }, "id");
    // No toast. The prompt closing IS the acknowledgement, and this one fired
    // on a screen the group is about to walk away from — a banner over the
    // next hole's scores telling them what they just did.
  };

  // ── The side games' money ────────────────────────────────────────
  // A MERGE of only the named fields, deliberately: writing the whole shape
  // every time would materialise `in: null` as a stored field and destroy the
  // distinction between "never configured" (everybody) and "nobody in".
  // Firestore's setDoc(merge:true) merges maps field by field, so patching
  // { skins: { in: [...] } } leaves the skins buy-in price alone.
  //
  // Takes a PATCH SET keyed by game — { skins: {...}, ctp: {...} } — because
  // the collection sheet's row toggle changes all four games at once, and
  // four writes for one tap is four chances for half of them to land.
  //
  // Applied locally first so sixteen taps down a roster feel immediate.
  const onUpdateSideGames = async (patchByGame) => {
    setSideGames(prev => {
      const next = { ...prev };
      Object.entries(patchByGame).forEach(([k, patch]) => { next[k] = { ...next[k], ...patch }; });
      return next;
    });
    await db.upsert("tournament_state", {
      id: `ts_${TOURNAMENT_ID}`,
      tournament_id: TOURNAMENT_ID,
      side_games: patchByGame,
      updated_at: new Date().toISOString(),
    });
  };

  // ── Placing a bet ────────────────────────────────────────────────
  // One document per bettor holding BOTH windows, written whole. The lots
  // are arrays rather than maps for exactly this reason: db.upsert merges,
  // and a map would keep a golfer the bettor has just sold out of.
  //
  // The window guard is on the screen, not here, because this is also the
  // director's correction path — a phone that died before the bell still has
  // to get its shares in.
  const onSaveMarketBet = async (pid, lots) => {
    if (!pid) return;
    const opening = normalizeLots(lots.opening);
    const mid = normalizeLots(lots.mid);
    setMarketBets(prev => {
      const rest = prev.filter(b => b.pid !== pid);
      return [...rest, { pid, opening, mid }].sort((a, b) => String(a.pid).localeCompare(String(b.pid)));
    });
    await db.upsert("skins", {
      id: docIds.marketBet(_e(), pid),
      tournament_id: TOURNAMENT_ID,
      skin_type: "market",
      player_id: pid,
      opening,
      mid,
      updated_at: new Date().toISOString(),
    });
  };

  // ── Confirming a standing CTP ────────────────────────────────────
  // The other answer the on-course prompt can take. A group that walks off a
  // par 3 without getting inside the standing tag is not saying nothing —
  // they are saying the tag is right, and that is the only thing that turns
  // "nobody has been asked" into "everybody has been asked and it stands".
  //
  // Additive and idempotent, so two phones in the same group confirming at
  // once converge instead of racing. A merge write of ONLY this field: the
  // winner, the distance and who tagged it belong to whoever tagged it.
  const onConfirmCtp = async (rnd, hole, pid) => {
    const rec = ((ctpData || {})[rnd] || {})[hole];
    if (!rec?.playerId || !pid) return;
    if ((rec.confirmedBy || []).includes(pid)) return;
    const confirmedBy = [...new Set([...(rec.confirmedBy || []), pid])];
    setCtpData(prev => ({
      ...prev,
      [rnd]: { ...(prev[rnd] || {}), [hole]: { ...rec, confirmedBy } },
    }));
    await db.upsert("skins", {
      id: docIds.ctp(_e(), rnd, hole),
      tournament_id: TOURNAMENT_ID,
      confirmed_by: confirmedBy,
    }, "id");
    // Same as onSetCtp: the prompt closing is the acknowledgement.
  };

  const setPairings = async (rnd, groups) => {
    const existing = JSON.stringify(pairingsData[rnd] || []);
    const incoming = JSON.stringify(groups);
    if (existing === incoming) return;
    setPairingsData(prev => ({ ...prev, [rnd]: groups }));
    // Two things this has to get right, found the hard way from two directions.
    //
    // A round's TEE TIMES live on its pairing rows, so rewriting the draw
    // rewrites them: they survive only because they are copied back out of
    // `teeTimesData` below. If that client state is empty when a save lands —
    // a cold load that has not filled it yet, a save raised from a screen that
    // never subscribed — the round comes back with every tee time gone, which
    // reads as "admin cleared the tee times" and locks every non-director out
    // of scoring behind a gate with nothing to open on. So when client state
    // has nothing, ask Firestore what is actually stored.
    //
    // And the write is ONE commit. The old shape deleted every pairing row for
    // the round and then wrote the new ones one at a time; the delete commits
    // by itself, so every listener saw a round with no pairings and no tee
    // times and published that, then watched them come back a group at a time.
    // That was the flash. Deletes and writes ride in the same batch now, so
    // there is no moment in between to observe. Times carry across by GROUP
    // INDEX — group 1 keeps its time when its players change, which is the
    // whole point of a tee sheet.
    //
    // One read serves both: the stored times when the client has none, and the
    // ids to delete. Reading rather than trusting the local mirror also means a
    // row another director left behind cannot survive as a player in two groups.
    const onServer = await db.get("pairings", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }, { field: "round_number", op: "==", value: rnd }]) || [];
    let times = (teeTimesData[rnd] || []);
    if (!times.some(t => t)) times = rowsToTeeTimes(onServer)[rnd] || times;
    const rows = [];
    groups.forEach((grp, gi) => {
      grp.forEach(pid => {
        rows.push({ id: docIds.pairing(_e(), rnd, gi + 1, pid), tournament_id: TOURNAMENT_ID, round_number: rnd, group_number: gi + 1, player_id: pid, tee_time: times[gi] || null });
      });
    });
    const keep = new Set(rows.map(r => r.id));
    const stale = onServer.map(r => r.id).filter(id => id && !keep.has(id));
    await db.replaceMany("pairings", rows, stale);
    notify(`Round ${rnd} pairings saved`);
  };

  const setTee = async (rnd, pid, teeName) => {
    setTeeData(prev => ({ ...prev, [rnd]: { ...(prev[rnd] || {}), [pid]: teeName } }));
    await db.upsert("tee_assignments", { id: docIds.teeAssignment(_e(), rnd, pid), tournament_id: TOURNAMENT_ID, round_number: rnd, player_id: pid, tee_name: teeName }, "id");
  };

  const setTeeBulk = async (rnd, assignments) => {
    setTeeData(prev => ({ ...prev, [rnd]: { ...(prev[rnd] || {}), ...assignments } }));
    const rows = Object.entries(assignments).map(([pid, teeName]) => ({ id: docIds.teeAssignment(_e(), rnd, pid), tournament_id: TOURNAMENT_ID, round_number: rnd, player_id: pid, tee_name: teeName }));
    await db.upsertMany("tee_assignments", rows);
  };

  // ── LOGIN ──
  // The roster-tile + per-player-PIN screen that used to live here is gone.
  // It checked a password stored per player, in the client, out of a document
  // any phone could read — which is to say it was a doorman, not a lock, and
  // it also meant Admin had to hand out and keep track of twelve of them.
  //
  // Getting in is now: sign in with Google or Apple, type the ONE event
  // password (GateScreen, checked by firestore.rules against a secret no
  // client can read), then claim your name off the roster. The event password
  // is set in Admin → Event.

  // Check if any round needs admin finalization
  const adminActionNeeded = useMemo(() => {
    for (let r = 1; r <= numRounds; r++) {
      if (finalizedRounds[r]) continue;
      const tr = tRounds.find(t => t.round_number === r);
      if (!tr) continue;
      // A player with no tee for a round that is being treated as ready.
      //
      // Gated on the round having been signed off OR already carrying scores,
      // rather than on the assignment simply being absent: before setup nobody
      // has a tee and a dot that is red from the moment an edition is created
      // is a dot nobody looks at. Once the director has saved the tees — or
      // once a card is being posted against them — a missing one is a fault,
      // and this is the only place in the app that says so without opening
      // Admin first.
      const course = courseList.find(c => c.id === tr.course_id);
      if (course) {
        const settled = !!teesSaved[r] || activePlayers.some(p => Object.keys(holeData[`${p.id}_${r}`] || {}).length > 0);
        if (settled && missingTees({
          players: activePlayers,
          assignments: teeData[r] || {},
          teeNames: (course.tee_boxes || []).map(t => t.name),
        }).length > 0) return true;
      }
      const allDone = activePlayers.length > 0 && activePlayers.every(p => {
        const wdTp = tPlayers.find(tp => tp.player_id === p.id);
        if (wdTp?.status === "WD") return true; // WD players count as done
        const scores = holeData[`${p.id}_${r}`] || {};
        for (let h = 0; h < 18; h++) { if (!(scores[h] > 0)) return false; }
        return true;
      });
      if (allDone) return true;
    }
    return false;
  }, [activePlayers, holeData, finalizedRounds, tRounds, tPlayers, numRounds, courseList, teeData, teesSaved]);

  // ── The ways in ──
  // Sign in → tournament password → claim a name, each skipped once it has
  // been answered, which for almost everybody means none of them appear again
  // after the first time.
  //
  // The password screen appears on a DEFINITIVE no (member === false), never
  // while the answer is still in flight. That ordering is the whole point: a
  // returning player whose session restored from localStorage renders the app
  // immediately and the door resolves behind them, so a slow read on the first
  // tee never puts a signed-in player back on a login screen. If the door then
  // says no — a revoked membership, or a first sign-in — this appears a beat
  // later, which beats an app that looks like it works and silently fails
  // every write.
  if (fbUser && member === false) {
    return (
      <GateScreen
        fbUser={fbUser}
        onCancel={handleLogout}
        onPassed={async () => {
          // Re-read rather than assume: the membership document that was just
          // created is also where Admin access is read from, and a director
          // flag set in the console before the first sign-in would be missed
          // by a locally-invented one.
          const { doc: m } = await loadMembership(fbUser.uid);
          setMembershipAnswer({ uid: fbUser.uid, doc: m || { uid: fbUser.uid } });
        }}
      />
    );
  }

  // Signed in, and nothing to show yet — either the door has not answered or
  // the roster has not arrived to say which player this account is. Holding
  // here rather than falling through to the login screen is what stops the
  // sign-in buttons appearing to somebody who is already signed in, which
  // reads as "it threw me back out" and is indistinguishable from the gate
  // having refused them.
  if (fbUser && !user && (member === undefined || !storageLoaded)) {
    return (
      <div style={{ minHeight: "var(--app-height, 100dvh)", background: `radial-gradient(ellipse at 20% 50%, #0d1f3c 0%, ${K.bg} 70%)`, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <img src={WBC_LOGO} alt="WBC" style={{ height: 72, opacity: 0.85, animation: "pulse 1.5s ease-in-out infinite", filter: "drop-shadow(0 4px 16px rgba(34,211,167,0.3))" }} />
        <style>{`@keyframes pulse { 0%,100% { opacity: 0.85; } 50% { opacity: 0.4; } }`}</style>
      </div>
    );
  }

  // A signed-in Firebase user with no resolved player takes precedence over the
  // login screen so they can pick their profile even before any app `user` is set.
  if (claimState?.status === "needs-claim") {
    return (
      <ClaimScreen
        fbUser={fbUser}
        candidates={claimState.candidates}
        busyId={claimBusyId}
        onClaim={(p) => { setClaimBusyId(p.id); claimProfile(fbUser, p, "manual"); }}
        onCancel={handleLogout}
      />
    );
  }

  if (!user) {
    return (
      <div style={{ minHeight: "var(--app-height, 100dvh)", background: `radial-gradient(ellipse at 20% 50%, #0d1f3c 0%, ${K.bg} 70%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Montserrat', sans-serif", fontVariantNumeric: "lining-nums tabular-nums", padding: 20 }}>
      <style>{`:root { --sab: env(safe-area-inset-bottom, 0px); }`}</style>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <style>{`
          @keyframes toastDown { 0% { transform: translateX(-50%) translateY(-20px); opacity: 0; } 100% { transform: translateX(-50%) translateY(0); opacity: 1; } }
          /* Same drop-in for a full-width bar, which holds no centring
             transform of its own to carry through the keyframe. */
          @keyframes toastDownBar { 0% { transform: translateY(-20px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
          @keyframes finalizeGlow { 0%,100% { box-shadow: 0 0 4px rgba(212,168,67,0.2); } 50% { box-shadow: 0 0 14px rgba(212,168,67,0.5); } }
          @keyframes pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 0.2; } }
        `}</style>

        <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
          <div style={{ width: 80, height: 100, margin: "0 auto 20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img src={WBC_LOGO} alt="WBC" style={{ height: 90, filter: "drop-shadow(0 4px 16px rgba(34,211,167,0.3))" }} />
          </div>
          <h1 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: FS.display, color: K.t1, margin: "0 0 4px", fontWeight: 800, letterSpacing: "-0.03em" }}>{tournamentName}</h1>
          <p style={{ color: K.t2, fontSize: FS.body, margin: "0 0 32px" }}>Wannabes. For Life.</p>

            <div>
              <p style={{ color: K.t3, fontSize: FS.label, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, margin: "0 0 12px" }}>Sign in</p>
              <button onClick={handleGoogleSignIn} style={{ width: "100%", padding: "13px 0", borderRadius: R.lg, background: "#fff", border: "none", color: "#1f1f1f", fontSize: FS.body, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                Sign in with Google
              </button>
              {APPLE_PROVIDER_ENABLED && !isAndroidNative() && (!isNativePlatform() || NATIVE_APPLE_ENABLED) && (
                <button onClick={handleAppleSignIn} style={{ width: "100%", marginTop: 10, padding: "13px 0", borderRadius: R.lg, background: "#000", border: "none", color: "#fff", fontSize: FS.body, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  <svg width="16" height="18" viewBox="0 0 384 512" aria-hidden="true" fill="#fff"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>
                  Sign in with Apple
                </button>
              )}
              {authMsg && <div style={{ color: K.danger, fontSize: FS.small, fontWeight: 600, marginTop: 10 }}>{authMsg}</div>}
              <p style={{ color: K.t3, fontSize: FS.label, margin: "14px 0 0", lineHeight: 1.5 }}>First time? Sign in, then pick your name from the roster.</p>
            </div>
          {(() => { const roundIsActive = Object.keys(holeData).some(key => { const parts = key.split("_"); const rnd = parseInt(parts[parts.length - 1]); return !finalizedRounds[rnd] && Object.keys(holeData[key] || {}).length > 0; }); const btnColor = roundIsActive ? K.acc : K.t2; const btnBorder = roundIsActive ? `1px solid ${K.acc}${ALPHA.hair}` : `1px solid ${K.bdr}`; return (<div style={{ marginTop: 24, borderTop: `1px solid ${K.bdr}${ALPHA.hair}`, paddingTop: 20 }}><button onClick={() => setUser({ id: "guest", name: "Guest", isDirector: false, isGuest: true })} style={{ width: "100%", padding: "13px 0", borderRadius: R.lg, background: "transparent", border: btnBorder, color: btnColor, fontSize: FS.body, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, letterSpacing: "0.02em" }} onMouseEnter={e => { e.currentTarget.style.background = btnColor  + ALPHA.wash; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>{roundIsActive && <span style={{ width: 7, height: 7, borderRadius: "50%", background: K.acc, display: "inline-block", boxShadow: `0 0 6px ${K.acc}` }} />}<img src="/wbc-trophy.png" alt="" style={{ height: 18, width: "auto", objectFit: "contain", filter: roundIsActive ? "none" : "brightness(0) invert(0.6)" }} />Live Leaderboard</button></div>); })()}
        </div>
      </div>
    );
  }
  if (user.isGuest) {
    return (
      <div style={{ minHeight: "var(--app-height, 100dvh)", background: "#030810", display: "flex", justifyContent: "center", overflow: "hidden" }}>
      <div style={{ height: "var(--app-height, 100dvh)", display: "flex", flexDirection: "column", background: K.bg, fontFamily: "'Montserrat', sans-serif", fontVariantNumeric: "lining-nums tabular-nums", color: K.t1, width: "100%", maxWidth: 480, position: "relative", boxShadow: "0 0 80px rgba(0,0,0,0.8)", flexShrink: 0, overflow: "hidden" }}>
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
        {/* The guest leaderboard is its own render branch, so it gets the
            same header rather than a second left-aligned copy of one. */}
        <AppHeader
          location={tournamentLocation}
          countdownAt={firstTeeAt}
          right={<button onClick={handleLogout} style={{ background: "transparent", border: `1px solid ${K.bdr}`, borderRadius: R.sm, color: K.t3, fontSize: FS.small, fontWeight: 600, padding: "5px 12px", cursor: "pointer" }}>Exit</button>}
        />
        <div style={{ padding: "14px 20px 0 20px", flex: 1, overflowY: "hidden", overflowX: "hidden", display: "flex", flexDirection: "column", minHeight: 0, marginBottom: 8 }}>
          <LeaderboardView lb={getLeaderboard} round={round} holeData={holeData} tRounds={tRounds} courses={courseList} tPlayers={tPlayers} getPlayerTee={getPlayerTee} finalizedRounds={finalizedRounds} skinWins={skinWins} pairingsData={pairingsData} teeTimesData={teeTimesData} loaded={storageLoaded} />
        </div>
      </div>
      </div>
    );
  }

  // ── MAIN ──
  // How far the bar's contents sit above the bottom of the screen.
  //
  // This was a bare safe-area inset, which is 0 on any device WITHOUT a home
  // indicator — every home-button iPhone and iPad. There the icons sat flush
  // on the physical edge, and a tap that landed slightly low hit the home
  // button instead of the button on screen: on those devices a held home
  // button is Siri, so a sloppy tap on the raised Board trophy opened Siri.
  //
  // So: a real floor for the devices with no inset, and a few px ON TOP of
  // the inset for the ones that have it, since the same slip is merely less
  // likely there rather than impossible.
  const NAV_BOTTOM_PAD = "max(16px, calc(env(safe-area-inset-bottom, 0px) + 6px))";

  // ── The nudge on the Betting tab ───────────────────────────────────
  // A red dot while YOU still have opening shares unplaced and the bell has
  // not rung. Unplaced shares are not a smaller bet — they are no bet at all
  // on those shares — and the window shuts on a clock, so the only thing
  // between a man who meant to finish his book and a wasted buy-in is being
  // told. It goes quiet the moment the book is full or the field tees off,
  // because after that there is nothing he can do about it.
  const marketNudge = (() => {
    if (!user || user.isGuest) return false;
    const ids = sideGames?.market?.in;
    if (ids != null && !ids.includes(user.id)) return false;
    if (openingSharesLeft(marketBets, user.id) === 0) return false;
    return marketWindows({
      holeData, players: allPlayers, numRounds, firstTeeAt, now: Date.now(),
    }).opening.open;
  })();

  const navItems = [
    { key: "groups", label: "Pairings", icon: "pairings" },
    { key: "scoring", label: "Scoring", icon: "score" },
    { key: "leaderboard", label: "Board", icon: "trophy" },
    { key: "skins", label: "Betting", icon: "betting" },
    // "More" rather than "Admin": the slot now opens a menu holding
    // everything that isn't the event — the director console, notifications
    // and the account — instead of being one of those three things and
    // leaving the other two scattered. See components/MoreMenu.
    { key: "more", label: "More", icon: "more" },
  ];

  return (
    <div style={{ minHeight: "var(--app-height, 100dvh)", background: "#030810", display: "flex", justifyContent: "center", overflow: "hidden" }}>
    <div style={{ height: "var(--app-height, 100dvh)", display: "flex", flexDirection: "column", background: K.bg, fontFamily: "'Montserrat', sans-serif", fontVariantNumeric: "lining-nums tabular-nums", color: K.t1, width: "100%", maxWidth: 480, position: "relative", boxShadow: "0 0 80px rgba(0,0,0,0.8)", flexShrink: 0, overflow: "hidden" }}>
      <style>{`:root { --sab: env(safe-area-inset-bottom, 0px); }`}</style>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />

      {/* Every notify() in the app lands here. It used to render only in the
          admin settings modal's header, so a message raised anywhere else —
          or from admin once that modal closed — was set and never shown. */}
      <Toast message={notif} />

      {/* Pull-to-refresh indicator. The app logo (golfer) as a MASK rather
          than an <img>, the same technique the nav uses, so the silhouette can
          be tinted and rotated cleanly — the PNG's alpha channel is what gets
          masked, and its background is fully transparent. Opacity ramps with
          the pull, and the ring lights up
          at the threshold — the two signals that tell you it will fire before
          you let go. position:fixed at top:0, so it clears the status bar /
          island itself via the safe-area inset. */}
      {pullY > 0 && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 999,
          display: "flex", justifyContent: "center",
          paddingTop: `calc(env(safe-area-inset-top, 0px) + ${Math.min(pullY, 100) - 20}px)`,
          transition: pullRefreshing ? "all .3s" : "none",
          pointerEvents: "none",
        }}>
          <style>{`
            @keyframes wbcPullSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            @keyframes wbcPullGlow { 0%,100% { box-shadow: 0 0 8px ${K.acc}${ALPHA.line}; } 50% { box-shadow: 0 0 18px ${K.acc}${ALPHA.panel}; } }
          `}</style>
          <div style={{
            width: 44, height: 44, borderRadius: "50%", background: K.card,
            border: `2.5px solid ${pullY >= PULL_THRESHOLD ? K.acc : K.bdr}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: pullY >= PULL_THRESHOLD ? `0 0 12px ${K.acc}${ALPHA.line}` : `0 2px 12px ${SHADOW}`,
            transition: `border-color ${MOTION}, box-shadow ${MOTION}`, overflow: "hidden",
            animation: pullRefreshing ? "wbcPullGlow 1s ease-in-out infinite" : "none",
          }}>
            <div style={{
              // 32 not 26: the logo PNG carries ~19% transparent padding on
              // each side, so the golfer itself lands at roughly the size the
              // trophy SVG used to occupy. Still clears the 39px inner circle.
              width: 32, height: 32, background: K.acc,
              WebkitMask: `url("${WBC_LOGO}") center/contain no-repeat`,
              mask: `url("${WBC_LOGO}") center/contain no-repeat`,
              opacity: pullY >= PULL_THRESHOLD ? 1 : 0.3 + (pullY / PULL_THRESHOLD) * 0.7,
              transform: pullRefreshing ? "none" : `rotate(${pullY * 3}deg)`,
              animation: pullRefreshing ? "wbcPullSpin .8s linear infinite" : "none",
              transition: pullRefreshing ? "none" : "opacity .2s",
            }} />
          </div>
        </div>
      )}

      <AppHeader
        location={tournamentLocation}
        /* The director's crown — components/GroupSwitcher. Only on the
           Scoring tab, because that is the screen it points; only for a
           director, because the flag it reads is the same one the security
           rules check; and only when there is more than one group to point
           at, since with one it would be a control that changes nothing.
           Up here it costs the scoring screen nothing at all — not a row,
           not a corner of one. */
        countdownAt={firstTeeAt}
        right={user.isDirector && view === "scoring" && switchableGroupList.length > 1 && (
          <GroupSwitcher
            groups={switchableGroupList}
            currentKey={scoringGroup ? groupKeyOf(scoringGroup.round, scoringGroup.ids) : null}
            live={liveRound(finalizedRounds, numRounds)}
            nameOf={pid => allPlayers.find(p => p.id === pid)?.name || pid}
            progressOf={g => groupProgress(g.round, g.ids, holeData, finalizedRounds)}
            onPick={g => {
              pickSeq.current += 1;
              setDirectorPick({ seq: pickSeq.current, round: g.round, ids: g.ids });
              setRound(g.round);
            }}
          />
        )}
      />

      <MoreMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        isDirector={!!user.isDirector}
        adminFlag={adminActionNeeded && user.isDirector}
        notifFlag={notifPerm !== "granted" && !user.isGuest}
        activeYear={getTournamentYear()}
        navH={navH}
        onSelect={(key) => {
          if (key === "admin") { setView("admin"); return; }
          if (key === "players") { setView("players"); return; }
          if (key === "photos") { setView("photos"); return; }
          if (key === "editions") { setEditionsOpen(true); return; }
          if (key === "account") { setDeleteErr(""); setDeleteStage(null); setAccountOpen(true); }
        }}
      />

      {/* Tournaments — the years, off the More menu. Open to everybody
          (reading a past year is what the entry is for, and firestore.rules
          allows the read to any member); only a director gets the New-year
          form, the status pill and the delete. */}
      <EditionSwitcher
        open={editionsOpen}
        onClose={() => setEditionsOpen(false)}
        notify={notify}
        canManage={!!user.isDirector}
      />

      {/* Notifications, in their own sheet rather than a section buried inside
          Account. They are a menu entry now, so they need somewhere to land —
          and they are no longer rendered in the Account sheet, so a preference
          still has exactly one home. */}
      {accountOpen && (
        <div
          onClick={() => { if (deleteStage !== "working") closeAccount(); }}
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(3,8,16,0.72)", backdropFilter: "blur(2px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            {...accountDrag.handlers}
            style={{ width: "100%", maxWidth: 480, background: K.card, borderTop: `1px solid ${K.bdr}`, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: "0 20px calc(20px + env(safe-area-inset-bottom, 0px))", boxShadow: "0 -12px 40px rgba(0,0,0,0.6)",
              // Folding Notifications in here roughly tripled this sheet's
              // height, and a bottom sheet grows UPWARDS — so on a small phone
              // Delete account, the last thing in it, went off the top with no
              // way to reach it. Capped and scrollable.
              maxHeight: "calc(var(--app-height, 100dvh) - 40px)", overflowY: "auto",
              // Follows the finger on a swipe down, springs back on release
              // unless it went far enough — see lib/useSheetDrag. Left OFF at
              // rest rather than set to translateY(0): a transform of any value
              // makes this element the containing block for anything fixed
              // inside it, and this sheet is exactly the kind of place a modal
              // gets raised from.
              transform: accountDrag.dragY ? `translateY(${accountDrag.dragY}px)` : undefined,
              transition: accountDrag.dragY === 0 ? `transform ${MOTION} ease` : "none" }}
          >
            {/* Sticky, because both things in it are ways OUT of the sheet and
                this sheet scrolls: a ✕ that scrolls off the top is a close
                button you have to scroll back up to find, and the swipe only
                takes the gesture when the content is already at the top. The
                negative side margins let the background span the full width so
                the content passes underneath it rather than beside it. */}
            <div style={{ position: "sticky", top: 0, zIndex: 1, background: K.card, margin: "0 -20px", padding: "20px 20px 18px" }}>
              <div style={{ width: 38, height: 4, borderRadius: R.xs, background: K.bdr, margin: "0 auto" }} />
              {/* Hidden mid-deletion for the same reason the backdrop stops
                  dismissing: there is nothing to go back to yet. */}
              {deleteStage !== "working" && (
                <button onClick={closeAccount} aria-label="Close" style={{ position: "absolute", top: 5, right: 20, width: 32, height: 32, borderRadius: R.sm, border: `1px solid ${K.bdr}`, background: "transparent", color: K.t2, fontSize: FS.lead, cursor: "pointer", lineHeight: 1 }}>✕</button>
              )}
            </div>

            {deleteStage === null && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
                  <div style={{ width: 42, height: 42, borderRadius: R.pill, background: `linear-gradient(135deg, ${K.acc}, ${K.accDim})`, display: "flex", alignItems: "center", justifyContent: "center", color: K.bg, fontWeight: 800, fontSize: FS.lead }}>
                    {(user.name || "?").trim().charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: FS.body, fontWeight: 700, color: K.t1 }}>{user.name}</div>
                    <div style={{ fontSize: FS.label, color: K.t3 }}>{user.isDirector ? "Tournament director" : "Player"}</div>
                  </div>
                </div>

                {/* ── Appearance ── */}
                {/* The same row as the notifications switch directly below it,
                    down to the labelled card it sits on — the title changing
                    colour when it is on, the sentence under it, and the same
                    Toggle. Two switches in one sheet drawn two different ways
                    read as two different KINDS of setting, and a switch sitting
                    loose on the sheet while the one under it sits on a bordered
                    card reads as the loose one being part of the header. */}
                <SectionLabel>Appearance</SectionLabel>
                <Card>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: FS.body, fontWeight: 800, color: theme === "light" ? K.acc : K.t1 }}>
                        {theme === "light" ? "Light mode" : "Dark mode"}
                      </div>
                      <div style={{ fontSize: FS.small, color: K.t2, lineHeight: 1.5, marginTop: 2 }}>
                        {theme === "light" ? "Easier to read in sunlight." : "Turn on for a light background."}
                      </div>
                    </div>
                    <Toggle on={theme === "light"} label="Light mode"
                      onChange={() => pickTheme(theme === "light" ? "dark" : "light")} />
                  </div>
                </Card>

                {/* Notifications, in the sheet that is already about you.
                    It was a menu row of its own, which put "which of my devices
                    buzzes" a level up alongside the tournament itself — and
                    made My Account a screen with two buttons on it. */}
                <NotificationSettings
                  user={user}
                  notify={notify}
                  onPermissionChange={setNotifPerm}
                />

                <div style={{ height: 1, background: K.bdr, margin: "18px 0 14px" }} />

                <Btn variant="secondary" block onClick={() => { setAccountOpen(false); handleLogout(); }}>
                  Log out
                </Btn>

                {fbUser && (
                  <Btn variant="dangerOutline" block style={{ marginTop: 10 }} onClick={() => { setDeleteErr(""); setDeleteStage("confirm"); }}>
                    Delete account
                  </Btn>
                )}

                <div style={{ textAlign: "center", marginTop: 14 }}>
                  <a href="/privacy" target="_blank" rel="noopener" style={{ color: K.t3, fontSize: FS.label, textDecoration: "none" }}>Privacy Policy</a>
                </div>
              </>
            )}

            {(deleteStage === "confirm" || deleteStage === "working") && (
              <>
                <div style={{ fontSize: FS.lead, fontWeight: 800, color: K.t1, marginBottom: 10 }}>Delete your account?</div>
                <div style={{ fontSize: FS.small, color: K.t2, lineHeight: 1.6, marginBottom: 12 }}>
                  This removes your login, your email address, and your notification settings. Your
                  historical tournament scores stay in the WBC record book as de-identified results,
                  no longer linked to you. This can't be undone.
                </div>
                <div style={{ fontSize: FS.label, color: K.t3, marginBottom: 16 }}>
                  Details in the <a href="/privacy" target="_blank" rel="noopener" style={{ color: K.t2 }}>Privacy Policy</a>.
                </div>

                {deleteErr && <div style={{ color: K.danger, fontSize: FS.small, fontWeight: 600, marginBottom: 12 }}>{deleteErr}</div>}

                <Btn
                  variant="danger" block
                  onClick={handleDeleteAccount}
                  disabled={deleteStage === "working"}
                >
                  {deleteStage === "working" ? "Deleting…" : "Permanently delete my account"}
                </Btn>
                <Btn
                  variant="secondary" block style={{ marginTop: 10, color: K.t2 }}
                  onClick={() => { if (deleteStage !== "working") { setDeleteStage(null); setDeleteErr(""); } }}
                  disabled={deleteStage === "working"}
                >
                  Cancel
                </Btn>
              </>
            )}
          </div>
        </div>
      )}

      {/* Players is a career record, not a round of this tournament — the
          round pills would be a control with nothing on the screen to steer.
          Photos is the same case from the other direction: the gallery carries
          its own round headings and shows every round at once, so a selector
          that picks one would contradict the screen under it. */}
      {view !== "admin" && view !== "scoring" && view !== "leaderboard" && view !== "players" && view !== "photos" && (
      <div style={{ display: "flex", gap: 6, padding: "10px 20px", borderBottom: `1px solid ${K.bdr}` }}>
        {Array.from({ length: NUM_ROUNDS }, (_, i) => i + 1).map(r => {
          const tr = tRounds.find(t => t.round_number === r);
          const c = tr ? courseList.find(cs => cs.id === tr.course_id) : null;
          return (
            <button key={r} onClick={() => setRound(r)} style={{
              flex: 1, padding: "8px 4px", fontSize: FS.small, fontWeight: round === r ? 700 : 500,
              color: round === r ? K.bg : K.t2,
              background: round === r ? `linear-gradient(135deg, ${K.acc}, ${K.accDim})` : K.card,
              border: `1px solid ${round === r ? "transparent" : K.bdr}`, borderRadius: R.sm, cursor: "pointer",
              lineHeight: 1.2,
            }}>
              <div>Rd {r}</div>
              {c && <div style={{ fontSize: FS.micro, opacity: 0.8, marginTop: 2, whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.3 }}>
                {c.name.replace(/^treetops\s*[–-]\s*/i, "").replace(/^(.*?)\s+GC$/i, "$1").replace(/^(.*?)\s+Golf\s+Club$/i, "$1")}
              </div>}
            </button>
          );
        })}
      </div>
      )}

      {/* Pairings joins the two views that lay out to the height they have
          rather than to the height of what is in them — the tab sizes its own
          type from that measurement, so it needs a floor to measure against. */}
      <div className="wbc-app-body" style={{ padding: (view === "leaderboard" || view === "admin") ? "14px 20px 0 20px" : "14px 20px", flex: 1, overflowY: "auto", overflowX: "hidden", display: (view === "leaderboard" || view === "admin" || view === "groups") ? "flex" : "block", flexDirection: "column", minHeight: 0, paddingBottom: (view === "leaderboard" || view === "admin") ? "28px" : 0 }}>
        {view === "leaderboard" && <LeaderboardView lb={getLeaderboard} round={round} holeData={holeData} tRounds={tRounds} courses={courseList} tPlayers={tPlayers} getPlayerTee={getPlayerTee} finalizedRounds={finalizedRounds} skinWins={skinWins} pairingsData={pairingsData} teeTimesData={teeTimesData} loaded={storageLoaded} />}
        <div style={{ display: view === "scoring" ? "block" : "none", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <OnCourseScoring user={user} players={allPlayers} round={round} tRounds={tRounds} courses={courseList} holeData={holeData} tPlayers={tPlayers} onSaveHole={onSaveHole} notify={notify} pairingsData={pairingsData} teeTimesData={teeTimesData} roundDates={roundDates} scoringOpen={scoringOpen} setTee={setTee} getPlayerTee={getPlayerTee} finalizedRounds={finalizedRounds} scorecardSigs={scorecardSigs} onSignScorecard={async (key, signerPid, signerName, present, rnd) => { const nonSigners = (present || []).filter(pid => pid !== signerPid); const autoFinal = nonSigners.length === 0; const optimistic = { signedBy: signerPid, signedByName: signerName, attestedBy: [], present: present || [] }; pendingSigsRef.current.set(key, { sig: optimistic, expiresAt: Date.now() + 8000 }); setScorecardSigs(prev => ({ ...prev, [key]: optimistic })); await db.upsert("wbc_scorecard_sigs", { id: docIds.scorecardSig(_e(), key, isDefaultEdition()), tournament_id: TOURNAMENT_ID, groupKey: key, round: rnd, signedBy: signerPid, signedByName: signerName, present: present || [], attestedBy: [], signedAt: new Date().toISOString() }); if (autoFinal) { const nf = { ...finalizedRounds, [key]: true }; setFinalizedRounds(nf); await saveTournamentState(nf); } }} onAttestScorecard={async (key, attesterPid, nonSigners) => { const cur = scorecardSigs[key]; if (!cur) return; const attestedBy = [...new Set([...(cur.attestedBy || []), attesterPid])]; const optimistic = { ...cur, attestedBy }; pendingSigsRef.current.set(key, { sig: optimistic, expiresAt: Date.now() + 8000 }); setScorecardSigs(prev => ({ ...prev, [key]: { ...prev[key], attestedBy } })); await db.upsert("wbc_scorecard_sigs", { id: docIds.scorecardSig(_e(), key, isDefaultEdition()), attestedBy }); const allDone = (nonSigners || []).every(pid => attestedBy.includes(pid)); if (allDone) { const nf = { ...finalizedRounds, [key]: true }; setFinalizedRounds(nf); await saveTournamentState(nf); } }} onUnsignScorecard={async key => { pendingSigsRef.current.delete(key); setScorecardSigs(prev => { const ns = { ...prev }; delete ns[key]; return ns; }); await db.deleteDoc("wbc_scorecard_sigs", docIds.scorecardSig(_e(), key, isDefaultEdition())); if (finalizedRounds[key]) { const nf = { ...finalizedRounds }; delete nf[key]; setFinalizedRounds(nf); await saveTournamentState(nf); } }} onFinalizeRound={async key => { const nf = { ...finalizedRounds, [key]: true }; setFinalizedRounds(nf); await saveTournamentState(nf); }} onUnfinalizeRound={async key => { const nf = { ...finalizedRounds }; delete nf[key]; setFinalizedRounds(nf); setScorecardSigs(prev => { const ns = { ...prev }; delete ns[key]; return ns; }); pendingSigsRef.current.delete(key); await db.deleteDoc("wbc_scorecard_sigs", docIds.scorecardSig(_e(), key, isDefaultEdition())); await saveTournamentState(nf); }} onGoToAdminCourses={(rnd) => { setView("admin"); setAdminSettingsOpen(true); setAdminSettingsTab("course"); setAdminSettingsRound(rnd || null); }} markPlayerWD={markPlayerWD} ctpData={ctpData} onSetCtp={onSetCtp} onConfirmCtp={onConfirmCtp} directorPick={directorPick} onGroupChange={setScoringGroup} onSetRound={setRound} />
        </div>
        {view === "players" && <PlayersView players={allPlayers} registry={registry} meId={user?.id} year={getTournamentYear()} isDirector={!!user.isDirector} onSetOverride={setIndexOverride} />}
        {/* Posting requires a real account: firestore.rules pins uploadedBy to
            the caller's uid, so a guest — who has no uid at all — can browse
            the library but cannot add to it. */}
        {view === "photos" && <PhotosView items={media} year={getTournamentYear()} uid={fbUser?.uid || null} isDirector={!!user.isDirector} isGuest={!!user.isGuest} canPost={!user.isGuest && !!fbUser?.uid && photoUploadsAllowed(photoConfig)} uploadsBlockedReason={photoUploadsAllowed(photoConfig) ? "" : uploadsDisabledReason(photoConfig)} onUpload={onUploadPhoto} onDelete={onDeletePhoto} notify={notify} />}
        {view === "skins" && <BettingView players={allPlayers} round={round} tRounds={tRounds} courses={courseList} holeData={holeData} ctpData={ctpData} onSetCtp={onSetCtp} user={user} numRounds={numRounds} getPlayerTee={getPlayerTee} getPlayerCH={getPlayerCH} sideGames={sideGames} onUpdateSideGames={onUpdateSideGames} marketBets={marketBets} onSaveMarketBet={onSaveMarketBet} leaderboard={getLeaderboard} finalizedRounds={finalizedRounds} pairingsData={pairingsData} firstTeeAt={firstTeeAt} marketNudge={marketNudge} teeTimesData={teeTimesData} roundDates={roundDates} />}
        {view === "groups" && <GroupsView players={activePlayers} round={round} tRounds={tRounds} courses={courseList} pairingsData={pairingsData} teeTimesData={teeTimesData} getPlayerTee={getPlayerTee} user={user} />}
        {view === "admin" && (user.isDirector ? <AdminView activePlayers={activePlayers} rosterPlayers={allPlayers} sideGames={sideGames} onUpdateSideGames={onUpdateSideGames} rebuyIds={rebuyIds} tournament={TOURNAMENT} tPlayers={tPlayers} tRounds={tRounds} courses={courseList} setCourseForRound={setCourseForRound} addCourse={addCourse} addPlayerToTournament={addPlayerToTournament} updateHI={updateHI} updateName={updateName} removePlayer={removePlayer} pairingsData={pairingsData} setPairings={setPairings} teeData={teeData} setTeeBulk={setTeeBulk} teeTimesData={teeTimesData} setTeeTimesData={async (updater) => {
              setTeeTimesData(prev => {
                const next = typeof updater === "function" ? updater(prev) : updater;
                // THE SHEET IS SAVED FIRST, and on its own document. Tee times
                // used to be written only onto pairing rows, so a time typed
                // against a group with nobody in it produced no rows and was
                // never stored at all — it sat in React state looking saved
                // until the next thing that rebuilt state from the server took
                // it away. A tee sheet is normally filled in BEFORE the draw,
                // which is exactly when there are no rows to carry it.
                saveTournamentState(finalizedRounds, undefined, undefined, undefined, undefined, undefined, next);
                // The rows keep their copy, because the scoring gate reads a
                // group's tee time off the row. One commit for all of them.
                const rows = [];
                Object.keys(next).forEach(rnd => {
                  (pairingsData[rnd] || []).forEach((grp, gi) => {
                    const teeTime = (next[rnd] || [])[gi] || null;
                    grp.forEach(pid => rows.push({
                      id: docIds.pairing(_e(), rnd, gi + 1, pid), tournament_id: TOURNAMENT_ID,
                      round_number: parseInt(rnd), group_number: gi + 1, player_id: pid, tee_time: teeTime,
                    }));
                  });
                });
                if (rows.length) db.upsertMany("pairings", rows);
                return next;
              });
            }} roundDates={roundDates} onSetRoundDate={async (rnd, dateStr) => { const next = { ...roundDates }; if (dateStr) next[rnd] = dateStr; else delete next[rnd]; setRoundDates(next); await saveTournamentState(finalizedRounds, teesSaved, teesModified, next, scoringOpen); }} scoringOpen={scoringOpen} onSetScoringOpen={async (rnd, open) => { const next = { ...scoringOpen }; if (open) next[rnd] = true; else delete next[rnd]; setScoringOpen(next); await saveTournamentState(finalizedRounds, teesSaved, teesModified, roundDates, next); }} pairingStrategy={pairingStrategy} onSetPairingStrategy={async (rnd, cfg) => { const next = { ...pairingStrategy }; if (cfg) next[rnd] = cfg; else delete next[rnd]; setPairingStrategy(next); await saveTournamentState(finalizedRounds, teesSaved, teesModified, roundDates, scoringOpen, next); }} leaderboard={getLeaderboard} holeData={holeData} finalizedRounds={finalizedRounds} onDiscardRoundScores={onDiscardRoundScores} onFinalizeRound={async rnd => { const nf = { ...finalizedRounds, [rnd]: true }; setFinalizedRounds(nf); await saveTournamentState(nf); await db.upsert("wbc_rounds_state", { id: `${TOURNAMENT_ID}_r${rnd}`, tournament_id: TOURNAMENT_ID, round: rnd, finalized: true }); if (rnd < NUM_ROUNDS) setRound(rnd + 1); }} onUnfinalizeRound={async key => { const nf = { ...finalizedRounds }; delete nf[key]; setFinalizedRounds(nf); await saveTournamentState(nf); if (/^\d+$/.test(String(key))) { await db.upsert("wbc_rounds_state", { id: `${TOURNAMENT_ID}_r${key}`, tournament_id: TOURNAMENT_ID, round: Number(key), finalized: false }); } else { setScorecardSigs(prev => { const ns = { ...prev }; delete ns[key]; return ns; }); await db.deleteDoc("wbc_scorecard_sigs", docIds.scorecardSig(_e(), key, isDefaultEdition())); } }} notify={notify} getPlayerTee={getPlayerTee} startFresh={startFresh} externalSettingsOpen={adminSettingsOpen} externalSettingsTab={adminSettingsTab} externalSettingsRound={adminSettingsRound} onExternalSettingsHandled={() => { setAdminSettingsOpen(false); setAdminSettingsTab("players"); setAdminSettingsRound(null); }} teesSaved={teesSaved} onTeesSave={async r => { const next = { ...teesSaved, [r]: true }; const nextMod = { ...teesModified, [r]: false }; setTeesSaved(next); setTeesModified(nextMod); await saveTournamentState(finalizedRounds, next, nextMod); }} teesModified={teesModified} onTeesModify={async r => { const nextMod = { ...teesModified, [r]: true }; setTeesModified(nextMod); await saveTournamentState(finalizedRounds, teesSaved, nextMod); }} memberships={memberships} onSetDirector={onSetDirector} claims={claims} authUid={fbUser?.uid || null} tournamentMeta={tournamentMeta} onSaveTournamentMeta={saveTournamentMeta} /> : (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ fontSize: FS.jumbo, marginBottom: 12 }}>🔒</div>
            <div style={{ fontSize: FS.lead, fontWeight: 700, color: K.t1, marginBottom: 6 }}>Directors Only</div>
            <div style={{ fontSize: FS.small, color: K.t3 }}>Admin settings are managed by tournament directors.</div>
          </div>
        ))}
      </div>

      <div ref={navRef} style={{ display: "flex", background: K.nav, borderTop: `1px solid ${K.bdr}`, zIndex: 100, paddingBottom: NAV_BOTTOM_PAD, flexShrink: 0 }}>
        {navItems.map(item => {
          // More reads active while its menu is open OR while one of the views
          // it leads to (Admin, Players) is the one on screen — otherwise
          // opening either would leave the whole bar looking unselected.
          const active = item.key === "more" ? (menuOpen || view === "admin" || view === "players" || view === "photos") : view === item.key;
          const clr = active ? K.acc : K.t3;
          const iconSz = 18;
          const navIcon = () => {
            if (item.icon === "trophy") return <img src="/wbc-trophy.png" alt="Board" style={{ width: 54, height: 54, objectFit: "contain", filter: active ? "none" : "brightness(0) saturate(100%) invert(40%) sepia(20%) saturate(600%) hue-rotate(185deg) brightness(90%)", marginTop: "-20px" }} />;
            if (item.icon === "pairings") return <svg width={iconSz} height={iconSz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M21 21v-2a3 3 0 00-2-2.83"/></svg>;
            if (item.icon === "score") return <svg width={iconSz} height={iconSz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg>;
            if (item.icon === "betting") return <svg width={iconSz} height={iconSz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>;
            if (item.icon === "more") return <svg width={iconSz} height={iconSz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="2" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>;
            return null;
          };
          const isTrophy = item.key === "leaderboard";
          return (
            <button key={item.key} onClick={() => {
              // The only nav item that is not a destination.
              if (item.key === "more") { setMenuOpen(o => !o); return; }
              if (item.key === "scoring") {
                // Find the correct active round: first after consecutive finalized rounds
                let activeRound = 1;
                for (let i = 1; i <= NUM_ROUNDS; i++) {
                  if (finalizedRounds[i]) { activeRound = i + 1; } else { break; }
                }
                activeRound = Math.min(activeRound, NUM_ROUNDS);
                // Only call setRound if we actually need to change it — avoids
                // triggering the group/hole reset chain unnecessarily
                setRound(prev => prev === activeRound ? prev : activeRound);
              }
              setView(item.key);
            }} style={{
              flex: 1, padding: "10px 4px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              background: "transparent", border: "none", cursor: "pointer", color: clr, position: "relative",
              marginTop: 0,
            }}>
              {isTrophy && (
                // The dome the trophy sits in: a true 68px circle — equal
                // radii, so the arc is a circle and not a squashed ellipse —
                // with everything below the bar's top border clipped away.
                //
                // The circle is 34 tall but only rises 24, so its widest point
                // and the near-vertical sides beneath it fall 10px BELOW that
                // border and read as two stubs poking down past the top of the
                // bar. clip-path cuts the box off at exactly the border line,
                // taking those sides with it and leaving the arc untouched.
                <div style={{
                  position: "absolute", top: "-24px", left: "50%", transform: "translateX(-50%)",
                  width: 68, height: 34,
                  background: K.nav,
                  borderRadius: "34px 34px 0 0",
                  clipPath: "inset(0 0 10px 0)",
                  borderTop: `1px solid ${K.bdr}`,
                  borderLeft: `1px solid ${K.bdr}`,
                  borderRight: `1px solid ${K.bdr}`,
                  zIndex: -1,
                  pointerEvents: "none",
                }} />
              )}
              {navIcon()}
              {(item.key === "more"
                  ? ((adminActionNeeded && user.isDirector) || (notifPerm !== "granted" && !user.isGuest))
                  : item.key === "skins" && marketNudge) && (
                <span style={{
                  position: "absolute", top: 6, right: "50%", marginRight: -14,
                  width: 8, height: 8, borderRadius: "50%", background: K.danger,
                  border: `2px solid ${K.nav}`,
                }} />
              )}
              <span style={{ fontSize: FS.micro, fontWeight: active ? 700 : 500, color: clr }}>{isTrophy ? "" : item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
    </div>
  );
}
