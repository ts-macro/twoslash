import { ref, computed } from 'vue'
//             ^?

const count = ref(0)
const double = computed(() => count.value * 2)
//     ^?

export default () => (
  <>
    <button onClick={()=>count.value++}>count is: { count }</button>
    //         ^?
    <p>Count is: { count }</p>
    //               ^?
  </>
)
