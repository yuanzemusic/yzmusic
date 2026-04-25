import { ref } from 'vue';

/*
 * 自维护的导航历史栈，提供浏览器风格的前进/后退能力。
 * 之所以不直接用 router.back() / router.forward()，是因为我们需要
 * 知道 canBack / canForward 的状态来给按钮置灰。
 *
 * 工作机制：
 *   - router.afterEach 触发时，如果不是我们主动 back/forward 引起的
 *     (skipNext 标志位)，就把当前路径推入栈中（并丢弃 pointer 之后的所有项，
 *     模拟浏览器在新 push 时清空 forward 历史的行为）。
 *   - navBack/navForward 调整 pointer 后调用 router.push 跳转，并设置 skipNext。
 */

const stack = []; // 路径数组，例如 ['/', '/search', '/local']
let pointer = -1; // 当前位置在 stack 中的下标
let skipNext = false; // 标记下一次 afterEach 是否由 nav* 触发

const canBack = ref(false);
const canForward = ref(false);

function update() {
  canBack.value = pointer > 0;
  canForward.value = pointer >= 0 && pointer < stack.length - 1;
}

let installed = false;
export function installNavHistory(router) {
  if (installed) return;
  installed = true;

  router.afterEach((to) => {
    const path = to.fullPath;
    if (skipNext) {
      // 这次跳转是 navBack/navForward 触发的，不入栈，pointer 已被更新
      skipNext = false;
    } else if (stack[pointer] === path) {
      // 同一路径不重复入栈
    } else {
      // 普通 push: 砍掉 pointer 之后的项，再追加
      stack.splice(pointer + 1);
      stack.push(path);
      pointer = stack.length - 1;
    }
    update();
  });
}

export function navBack(router) {
  if (!canBack.value) return;
  pointer--;
  skipNext = true;
  router.push(stack[pointer]);
}

export function navForward(router) {
  if (!canForward.value) return;
  pointer++;
  skipNext = true;
  router.push(stack[pointer]);
}

export function useNavHistory() {
  return { canBack, canForward };
}
